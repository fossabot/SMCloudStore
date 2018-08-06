'use strict'

import GCStorage from '@google-cloud/storage'
import {Duplex, Stream} from 'stream'
import {ListItemObject, ListItemPrefix, ListResults, StorageProvider} from '../lib/StorageProvider'

/**
 * Connection options for a Google Cloud Storage provider.
 */
interface GoogleCloudConnectionOptions {
    /** ID of the Google Cloud project */
    projectId: string
    /** Path of the JSON file containing the keys */
    keyFilename: string
}

/**
 * Client to interact with Google Cloud Storage.
 */
class GoogleCloudStorageProvider extends StorageProvider {
    protected _client: GCStorage.Storage

    /**
     * Initializes a new client to interact with Minio.
     * 
     * @param connection - Dictionary with connection options.
     */
    constructor(connection: GoogleCloudConnectionOptions) {
        super()

        // Provider name
        this._provider = 'GoogleCloudStorage'

        if (!connection || !Object.keys(connection).length) {
            throw new Error('Connection argument is empty')
        }

        // The Google Cloud library will validate the connection object
        this._client = GCStorage(connection)
    }

    /**
     * Create a container ("bucket") on the server.
     * 
     * @param container - Name of the container
     * @param region - Region in which to create the container.
     * @returns Promise that resolves once the container has been created. The promise doesn't contain any meaningful return value.
     * @async
     */
    createContainer(container: string, region: string): Promise<void> {
        if (!region) {
            throw Error('Argument region must be not empty')
        }

        const bucket = this._client.bucket(container)
        return bucket.create({
            location: region,
            regional: true
        }).then(() => {
            return
        })
    }

    /**
     * Check if a container exists.
     * 
     * @param container - Name of the container
     * @returns Promises that resolves with a boolean indicating if the container exists.
     * @async
     */
    containerExists(container: string): Promise<boolean> {
        const bucket = this._client.bucket(container)

        return bucket.exists().then((response) => {
            return !!response[0]
        })
    }

    /**
     * Create a container ("bucket") on the server if it doesn't already exist.
     * 
     * @param container - Name of the container
     * @param region - Region in which to create the container.
     * @returns Promise that resolves once the container has been created
     * @async
     */
    async ensureContainer(container: string, region: string): Promise<void> {
        const exists = await this.containerExists(container)
        if (!exists) {
            return this.createContainer(container, region)
        }
    }

    /**
     * Lists all containers belonging to the user
     * 
     * @returns Promise that resolves with an array of all the containers
     * @async
     */
    async listContainers(): Promise<string[]> {
        const list = await this._client.getBuckets()
        if (!list || !list[0] || !list[0].length) {
            return []
        }
        else {
            return list[0].map((el) => (el && el.name))
        }
    }

    /**
     * Removes a contaienr from the server
     * 
     * @param container - Name of the container
     * @returns Promise that resolves once the container has been removed
     * @async
     */
    deleteContainer(container: string): Promise<void> {
        const bucket = this._client.bucket(container)
        return bucket.delete().then(() => {
            return
        })
    }

    /**
     * Uploads a stream to the object storage server
     * 
     * @param container - Name of the container
     * @param path - Path where to store the object, inside the container
     * @param data - Object data or stream. Can be a Stream (Readable Stream), Buffer or string.
     * @param metadata - Key-value pair with metadata for the object, for example `Content-Type` or custom tags
     * @returns Promise that resolves once the object has been uploaded
     * @async
     */
    putObject(container: string, path: string, data: Stream|string|Buffer, metadata: any): Promise<void> {
        const bucket = this._client.bucket(container)
        const file = bucket.file(path)

        // Convert strings and buffers to streams
        let dataStream: Stream
        if (typeof data == 'object' && typeof (data as any).pipe == 'function') {
            dataStream = data as Stream
        }
        else {
            dataStream = new Duplex()
            // Buffers
            if (typeof data == 'object' && Buffer.isBuffer(data)) {
                (dataStream as Duplex).push(data)
            }
            else if (typeof data == 'string') {
                (dataStream as Duplex).push(data, 'utf8')
            }
            else {
                throw Error('Invalid data argument: must be a stream, a Buffer or a string')
            }
            (dataStream as Duplex).push(null)
        }

        return new Promise((resolve, reject) => {
            // Clone the metadata object before modifying it
            const metadataClone = Object.assign({}, metadata) as {[k: string]: string}

            const options = {
                metadata: metadataClone,
                resumable: false,
                validation: 'md5'
            } as GCStorage.WriteStreamOptions

            // Check if we have a Content-Type
            if (metadataClone['Content-Type']) {
                options.contentType = metadataClone['Content-Type']
                delete metadataClone['Content-Type']
            }

            dataStream.pipe(file.createWriteStream(options))
                .on('error', (err) => {
                    reject(err)
                })
                .on('finish', () => {
                    resolve()
                })
        })
    }

    /**
     * Requests an object from the server. The method returns a Promise that resolves to a Readable Stream containing the data.
     * 
     * @param container - Name of the container
     * @param path - Path of the object, inside the container
     * @returns Readable Stream containing the object's data
     * @async
     */
    getObject(container: string, path: string): Promise<Stream> {
        const bucket = this._client.bucket(container)
        const file = bucket.file(path)

        // For Google Cloud Storage, this method doesn't actually need to be asynchronous
        return Promise.resolve(file.createReadStream({validation: 'md5'}))
    }

    /**
     * Returns a list of objects with a given prefix (folder). The list is not recursive, so prefixes (folders) are returned as such.
     * 
     * @param container - Name of the container
     * @param  prefix - Prefix (folder) inside which to list objects
     * @returns List of elements returned by the server
     * @async
     */
    listObjects(container: string, prefix: string): Promise<ListResults> {
        let list = [] as ListResults
        const requestPromise = (opts: GCStorage.BucketQuery): Promise<ListResults> => {
            return new Promise((resolve, reject) => {
                if (!opts) {
                    opts = {
                        autoPaginate: false,
                        delimiter: '/',
                        // maxResults: 2, // For debug only
                        prefix
                    }
                }

                // Using the callback API so we can get the full list
                // Error in typings below
                (this._client.bucket(container) as any).getFiles(opts, (err, files, nextQuery, apiResponse) => {
                    if (err) {
                        return reject(err)
                    }

                    if (files && files.length) {
                        list = list.concat(files.map((el) => {
                            const obj = {
                                path: el.name
                            } as ListItemObject
                            if (el.metadata) {
                                if (el.metadata.size) {
                                    obj.size = parseInt(el.metadata.size, 10)
                                }
                                if (el.metadata.updated) {
                                    obj.lastModified = new Date(el.metadata.updated)
                                }
                                if (el.metadata.timeCreated) {
                                    obj.creationTime = new Date(el.metadata.timeCreated)
                                }
                                if (el.metadata.md5Hash) {
                                    // Google Cloud Storage returns the MD5 as base64, so convert it to HEX
                                    obj.contentMD5 = Buffer.from(el.metadata.md5Hash, 'base64').toString('hex')
                                }
                                if (el.metadata.contentType) {
                                    obj.contentType = el.metadata.contentType
                                }
                            }
                            return obj
                        }))
                    }

                    if (apiResponse && apiResponse.prefixes) {
                        list = list.concat(apiResponse.prefixes.map((el) => {
                            return {prefix: el} as ListItemPrefix
                        }))
                    }

                    if (nextQuery) {
                        return resolve(requestPromise(nextQuery))
                    }
                    else {
                        return resolve(list)
                    }
                })
            })
        }

        return requestPromise(null)
    }

    /**
     * Removes an object from the server
     * 
     * @param container - Name of the container
     * @param path - Path of the object, inside the container
     * @returns Promise that resolves once the object has been removed
     * @async
     */
    removeObject(container: string, path: string): Promise<void> {
        const bucket = this._client.bucket(container)
        const file = bucket.file(path)

        // Returns a promise
        return file.delete().then(() => {
            return
        })
    }
}

export = GoogleCloudStorageProvider