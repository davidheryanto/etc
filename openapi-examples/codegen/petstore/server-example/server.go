package main

import (
	"github.com/deepmap/oapi-codegen/pkg/middleware"
	"github.com/labstack/echo/v4"
	"math/rand"
	"net/http"
	"petstore"
)

// The address this HTTP server will listen to
var addr = ":9000"

func main() {
	router := echo.New()

	// Register OpenAPI validation middleware. This e.g. will validate that enum values are valid and properties or
	// path parameters are of correct data types.
	spec, err := petstore.GetSwagger()
	if err != nil {
		panic(err)
	}
	router.Use(middleware.OapiRequestValidator(spec))

	// This is our server that implements the operations in OpenAPI spec
	server := &server{}

	petstore.RegisterHandlers(router, server)
	panic(router.Start(addr))
}

// server implements ServerInterface defined in server.gen.go. This is our implementation of what
// each operation in the OpenAPI spec is supposed to perform.
type server struct{}

func (s *server) AddPet(ctx echo.Context) error {
	var newPet petstore.Pet
	if err := ctx.Bind(&newPet); err != nil {
		return err
	}

	// Simulate adding pet with the generation of pet id (e.g from database primary key)
	genPetId := rand.Int63n(100)
	newPet.Id = &genPetId

	return ctx.JSON(http.StatusOK, newPet)
}

func (s *server) GetPetById(ctx echo.Context, petId int64) error {
	pet := petstore.Pet{
		Id:   &petId,
		Name: "fake-name",
		Tags: "fake-tag",
	}
	return ctx.JSON(http.StatusOK, pet)
}
