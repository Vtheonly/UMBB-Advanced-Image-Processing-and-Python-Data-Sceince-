---
sources:
  - "[[08.04 TCP Header Architecture, Control Flags & Field Calculations]]"
  - "[[08.05 TCP Three-Way Handshake & Connection Teardown Math]]"
  - "[[08.06 TCP Sliding Window, Flow Control & Segment Loss Recovery]]"
---

> [!question] The SYN and FIN flags each consume one sequence number even without payload data.
>> [!success]- Answer
>> True

> [!question] A pure ACK segment (no payload) advances the sender's sequence number by one.
>> [!success]- Answer
>> False

> [!question] The maximum TCP segment size inside a standard Ethernet encapsulation is 1460 bytes.
>> [!success]- Answer
>> True

> [!question] PSH = 1 tells the sender to transmit data without delay via the urgent pointer.
>> [!success]- Answer
>> False

> [!question] URG = 1 means the Urgent Pointer field is valid and marks the end of priority data.
>> [!success]- Answer
>> True

> [!question] PSH = 1 instructs the receiving TCP stack to flush its buffer to the application immediately.
>> [!success]- Answer
>> True

> [!question] SACK stands for Selective Acknowledgment and lets a receiver confirm non-contiguous data blocks.
>> [!success]- Answer
>> True

> [!question] The TCP Window field is 16 bits wide.
>> [!success]- Answer
>> True

> [!question] A duplicate ACK repeats the next expected in-order byte, implicitly signaling a lost segment.
>> [!success]- Answer
>> True

> [!question] After a lost segment is retransmitted and received, the cumulative ACK jumps over all buffered out-of-order data.
>> [!success]- Answer
>> True

> [!question] A FIN may piggyback on the final data segment, and the peer's ACK acknowledges data and FIN together.
>> [!success]- Answer
>> True

> [!question] In the three-way handshake, the server's SYN+ACK carries Nack = ISN_client + 1.
>> [!success]- Answer
>> True

> [!question] The minimum TCP header size is 20 bytes and the maximum is 60 bytes.
>> [!success]- Answer
>> True

> [!question] An ACK number N confirms receipt of every byte up to and including byte N.
>> [!success]- Answer
>> False

> [!question] Which flag pair appears on the second message of the three-way handshake?
> a) SYN=1, ACK=0
> b) SYN=1, ACK=1
> c) FIN=1, ACK=1
> d) SYN=0, ACK=1
>> [!success]- Answer
> b) SYN=1, ACK=1

> [!question] Host A sends a segment with Nseq=101 and Len=1000 that arrives correctly. What does the receiver ACK?
> a) Nack = 101
> b) Nack = 1000
> c) Nack = 1101
> d) Nack = 1102
>> [!success]- Answer
> c) Nack = 1101

> [!question] Segments 1 and 2 are sent; segment 1 is lost and segment 2 arrives. What ACK does the receiver send?
> a) The next byte after segment 2 (cumulative skip)
> b) A duplicate ACK for the start of segment 1
> c) No ACK until segment 1 is retransmitted
> d) An RST segment
>> [!success]- Answer
> b) A duplicate ACK for the start of segment 1

> [!question] A sender's last acknowledged byte is 999 and the receiver advertises Win = 2000. Up to which byte may the sender transmit?
> a) 1999
> b) 2000
> c) 2999
> d) 3000
>> [!success]- Answer
> c) 2999

> [!question] Which is NOT a TCP control flag?
> a) PSH
> b) POP
> c) RST
> d) URG
>> [!success]- Answer
> b) POP

> [!question] What is the MSS for a 1500-byte MTU with 20-byte IP and 20-byte TCP headers?
> a) 1500 bytes
> b) 1480 bytes
> c) 1460 bytes
> d) 1404 bytes
>> [!success]- Answer
> c) 1460 bytes

> [!question] The client's ISN is 500. What Nseq does the client's third handshake message carry?
> a) 500
> b) 501
> c) 502
> d) 0
>> [!success]- Answer
> b) 501

> [!question] A host sends ACK+FIN with Nseq=2151 and Len=500. What is the next expected sequence number for its stream?
> a) 2651
> b) 2652
> c) 2152
> d) 2650
>> [!success]- Answer
> b) 2652

> [!question] Match the flag with its action.
>> [!example] Group A
>> a) URG
>> b) PSH
>> c) RST
>
>> [!example] Group B
>> n) Receiver flushes its buffer to the application immediately.
>> o) Urgent Pointer is valid; sender transmits priority data without delay.
>> p) Abruptly aborts a broken or rejected connection.
>
>> [!success]- Answer
>> a) -> o)
>> b) -> n)
>> c) -> p)

> [!question] Match the field with its size.
>> [!example] Group A
>> a) TCP Sequence Number
>> b) TCP Window
>> c) UDP header
>
>> [!example] Group B
>> n) 16 bits
>> o) 32 bits
>> p) 8 bytes (four 16-bit fields)
>
>> [!success]- Answer
>> a) -> o)
>> b) -> n)
>> c) -> p)

> [!question] Match the TCP mechanism with its purpose.
>> [!example] Group A
>> a) Sliding window
>> b) SACK option
>> c) Duplicate ACK
>
>> [!example] Group B
>> n) Flow control limiting unacknowledged bytes in flight.
>> o) Signals a missing segment by repeating the last in-order expectation.
>> p) Confirms non-contiguous received blocks so only gaps are retransmitted.
>
>> [!success]- Answer
>> a) -> n)
>> b) -> p)
>> c) -> o)
