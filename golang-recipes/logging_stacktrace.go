// Reference: Go in Practice chapter 5

package main

import (
    "fmt"
    "runtime"
)

func main() {
    foo()
}
func foo() {
    bar()
}
func bar() {
    buf := make([]byte, 1024)
    runtime.Stack(buf, false)
    fmt.Printf("Trace:\n %s\n", buf)
}
