// Package petstore provides primitives to interact the openapi HTTP API.
//
// Code generated by github.com/deepmap/oapi-codegen DO NOT EDIT.
package petstore

// Pet defines model for Pet.
type Pet struct {
	Id   *int64  `json:"id,omitempty"`
	Name string  `json:"name"`
	Tags PetTags `json:"tags"`
}

// PetTags defines model for PetTags.
type PetTags string

// List of PetTags
const (
	PetTags_cat PetTags = "cat"
	PetTags_dog PetTags = "dog"
)

// AddPetJSONBody defines parameters for AddPet.
type AddPetJSONBody Pet

// AddPetRequestBody defines body for AddPet for application/json ContentType.
type AddPetJSONRequestBody AddPetJSONBody
