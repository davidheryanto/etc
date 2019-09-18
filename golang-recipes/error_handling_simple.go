// Reference: Go in Practice chapter 4

package main

import (
    "errors"
    "fmt"
    "os"
    "strings"
)

// Concat concatenates a bunch of strings, separated by spaces.
// It returns an empty string and an error if no strings were passed in.
func Concat(parts ...string) (string, error) {
    if len(parts) == 0 {
        // Returns both an empty (usable) string and an error
        // rather than both nil so that users of Concat()
        // can use the returned string value better rather than
        // creating more if else statements
        return "", errors.New("no strings supplied")
    }
    return strings.Join(parts, " "), nil
}
func main() {
    args := os.Args[1:]
    if result, err := Concat(args...); err != nil {
        fmt.Printf("Error: %s\n", err)
    } else {
        fmt.Printf("Concatenated string: '%s'\n", result)
    }
}

// NOTES:
// - If a function can return a useful result when it
//   errs, then it should return one
// - Write function documentation