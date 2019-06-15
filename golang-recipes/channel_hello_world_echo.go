package main

import (
	"fmt"
	"log"
	"os"
	"time"
)

const timeoutInSec = 10

// Ref: https://github.com/Masterminds/go-in-practice/tree/master/chapter3/echoredux
// Example of using channel to echo messages
// Close the channel after "timeoutInSec" seconds
func main() {
	fmt.Println("Enter a message, press ENTER, channel will reply the same message")

	// "done" channel will receive a message after "timeoutInSec" seconds
	done := time.After(timeoutInSec * time.Second)
	// "echo" channel will passing bytes from stdin to stdout
	echo := make(chan []byte)

	go readStdin(echo)

	for {
		select {
		case buf := <-echo:
			os.Stdout.Write(buf)
		// After "timeoutInSec" seconds "done" channel will receive a time.Time object
		// but we do not need the input, hence assigning it to nothing
		case <-done:
			fmt.Println("Timed out")
			close(echo)
			os.Exit(0)
		}
	}
}

// Function takes a write-only channel (chan <-)
// Good practice to indicate if the function receives/sends on a channel
func readStdin(out chan<- []byte) {
	for {
		data := make([]byte, 1024)
		n, err := os.Stdin.Read(data)
		if err != nil {
			log.Fatal(err)
		}
		if n > 0 {
			out <- data
		}
	}
}
