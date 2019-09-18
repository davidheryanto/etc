package main

import (
	"fmt"
	"time"
)

const timeoutInSec = 3

// Ref: https://github.com/Masterminds/go-in-practice/tree/master/chapter3
// Example of properly closing a channel
// "Sender" should be the one "closing" the channel
func main() {
	msg := make(chan string)
	// Use done channel to send a signal between coroutines
	done := make(chan bool)
	until := time.After(timeoutInSec * time.Second)

	go send(msg, done)

	for {
		select {
		case m := <-msg:
			fmt.Println(m)
		case <-until:
			done <- true
			time.Sleep(500 * time.Millisecond)
			return
		}
	}
}

// "ch" is a receiving channel, "done" is a sending channel
func send(ch chan<- string, done <-chan bool) {
	for {
		select {
		case <-done:
			println("Done")
			close(ch)
			return
		default:
			ch <- "hello"
			time.Sleep(500 * time.Millisecond)
		}
	}
}
