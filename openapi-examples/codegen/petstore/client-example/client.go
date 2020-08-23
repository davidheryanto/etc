package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"petstore"
)

// Assumes the HTTP server is running
var server = "http://localhost:9000"

func main() {
	client, err := petstore.NewClientWithResponses(server)
	if err != nil {
		panic(err)
	}

	// Test getting a new pet by id
	getPetResp, err := client.GetPetByIdWithResponse(context.TODO(), 3)
	if err != nil {
		panic(err)
	}
	fmt.Println("Get pet with id 3:", getPetResp.Status(), string(getPetResp.Body))

	// Test adding a new pet
	newPet := petstore.Pet{
		Name: "new-pet",
		Tags: "cat",
	}

	newPetBody, err := json.Marshal(newPet)
	if err != nil {
		panic(err)
	}

	addPetResp, err := client.AddPetWithBodyWithResponse(context.TODO(), "application/json", bytes.NewReader(newPetBody))
	if err != nil {
		panic(err)
	}
	fmt.Println("Add pet:", addPetResp.Status(), string(addPetResp.Body))
}
