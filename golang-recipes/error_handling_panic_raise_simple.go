// Reference: Go in Practice chapter 4

package main

import "errors"

func main() {
    panic(errors.New("Something bad happened."))
}
