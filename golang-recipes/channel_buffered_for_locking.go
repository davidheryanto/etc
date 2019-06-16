package main

import (
	"fmt"
	"time"
)

// Ref: https://github.com/Masterminds/go-in-practice/tree/master/chapter3
// Example of using "buffered" channel for simple locking
// Use case: sync read/write on "shared" resources
func main() {
	lock := make(chan bool, 1)
	for i := 1; i < 7; i++ {
		go worker(i, lock)
	}
	time.Sleep(5 * time.Second)
}

func worker(id int, lock chan bool) {
	fmt.Printf("%d wants the lock\n", id)
	// A worker acquires a lock by sending it a message
	lock <- true
	fmt.Printf("  %d has the lock\n", id)
	time.Sleep(500 * time.Millisecond)
	fmt.Printf("    %d is releasing the lock\n", id)
	// A worker releases a lock by reading a value of it
	<-lock
}