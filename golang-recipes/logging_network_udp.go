// Reference: Go in Practice chapter 5

package main

import (
    "log"
    "net"
    "time"
)

func main() {
    timeout := 30 * time.Second
    conn, err := net.DialTimeout("tcp", "localhost:1902", timeout)
    if err != nil {
        panic("Failed to connect to localhost:1902")
    }
    defer conn.Close()
    f := log.Ldate | log.Lshortfile
    logger := log.New(conn, "example ", f)
    logger.Println("This is a regular message.")
    logger.Panicln("This is a panic.")
}

// Simulate a log processing system with netcat
// -l (listen) -k (continuous) -u (udp)
//
// TCP:
// nc -lk 1902
// 
// UDP:
// nc -lu 1902