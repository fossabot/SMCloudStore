# @smcloudstore/minio

This package is a provider for [SMCloudStore](https://github.com/ItalyPaleAle/SMCloudStore), for Minio. SMCloudStore is a lightweight Node.js module that offers a simple API to interact with the object storage services of multiple cloud providers.

Please refer to the [main package](https://github.com/ItalyPaleAle/SMCloudStore) for the SMCloudStore documentation and instructions on how to use it.

## Provider-specific considerations

There are a few provider-specific considerations for the Minio provider.

### Connection argument

When initializing the Minio provider, the `connection` argument is an object with:

- `connection.endPoint`: string representing the endpoint of the server to connect to, which is the URL of the Minio server
- `connection.accessKey`: string containing the access key (the "public key")
- `connection.secretKey`: string containing the secret key
- `connection.useSSL` (optional): boolean that will force the connection using HTTPS if true (default: true)
- `connection.port` (optional): number representing the port to connect to; defaults to 443 if `useSSL` is true, 80 otherwise

Example:

````js
// Require the package
const SMCloudStore = require('smcloudstore')

// Complete with the connection options for Minio
const connection = {
    endPoint: 'localhost',
    port: 9000,
    useSSL: false,
    accessKey: 'PUBLIC_KEY_HERE',
    secretKey: 'SECRET_KEY_HERE',
}

// Return an instance of the MinioProvider class
const storage = SMCloudStore.create('minio', connection)
````

### Using pre-signed URLs

In the method [`storage.presignedPutUrl(container, path, [options], [ttl])`](https://italypaleale.github.io/SMCloudStore/classes/minio.minioprovider.html#presignedputurl), the Minio provider ignores the `options` argument, which has no effect on the generated tokens.

### Accessing the Minio library

The Minio provider is built on top of the [Minio JavaScript client](https://github.com/minio/minio-js), which is exposed by calling [`storage.client()`](https://italypaleale.github.io/SMCloudStore/classes/minio.minioprovider.html#client).

You can use the object returned by this method to perform low-level operations using the Minio client.
