# Example usage of OpenAPI codegen

The objective of generating HTTP client and server code based on OpenAPI spec is to reduce boilerplate codes
and ensure server and client codes are always consistent with the OpenAPI spec.

Less boilerplate codes means we can focus on developing the business logic (our app main value and differentiating
factor) versus spending time scaffolding the HTTP request parsing and validation. With code generation,
changes to the OpenAPI spec **forces** client and server codes to recognize the changes. The spec becomes a contract
that both client and server will follow all the time.

This example makes use these libraries:
- https://github.com/getkin/kin-openapi: support for parsing and validating OpenAPI v3 spec
- https://github.com/deepmap/oapi-codegen: support for client and server code generation based on OpenAPI v3 spec

## Pre-requisites

Install the following tools required, like so:

```shell script
# Install oapi-codegen CLI
go get github.com/deepmap/oapi-codegen/cmd/oapi-codegen
```

## Getting started

The OpenAPI spec `openapi.yaml` will be used to generate client and server codes.

```shell script
oapi-codegen -package petstore -generate spec   openapi.yaml > spec.gen.go
oapi-codegen -package petstore -generate types  openapi.yaml > types.gen.go 
oapi-codegen -package petstore -generate client openapi.yaml > client.gen.go 
oapi-codegen -package petstore -generate server openapi.yaml > server.gen.go
```

Example server and client implementations are located in `server-example` and `client-example` folder,
 which can be run like so:

```shell script
go run server-example/server.go
go run client-example/client.go
```