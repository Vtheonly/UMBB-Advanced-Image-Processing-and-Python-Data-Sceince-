---
sources:
  - "[[06.02 Hop-by-Hop Packet Tracing (L2 MAC vs L3 IP Rewrites)]]"
  - "[[06.03 Dynamic Host Configuration Protocol (DHCP) Full Architecture]]"
  - "[[06.05 Linux Routing, Tools & iptables DMZ Forwarding]]"
  - "[[06.06 IEEE 802.11 Wireless Architecture (CSMA-CA, IFS, DSSS)]]"
---

> [!question] Across a routed path without NAT, IP source and destination addresses change at every router hop.
>> [!success]- Answer
>> False

> [!question] MAC source and destination addresses are rewritten at every router hop.
>> [!success]- Answer
>> True

> [!question] The DHCP transaction order is Discover, Offer, Request, ACK (DORA).
>> [!success]- Answer
>> True

> [!question] A DHCP server listens on UDP port 68 and the client listens on UDP port 67.
>> [!success]- Answer
>> False

> [!question] Before offering an address, a DHCP server verifies it is unused by sending an ICMP Echo Request (ping).
>> [!success]- Answer
>> True

> [!question] After receiving an address, a DHCP client checks for conflicts by sending a Gratuitous ARP.
>> [!success]- Answer
>> True

> [!question] The T1 renewal timer fires at 87.5% of the lease duration.
>> [!success]- Answer
>> False

> [!question] At T2, the client broadcasts its DHCPREQUEST to any available DHCP server.
>> [!success]- Answer
>> True

> [!question] A Flags value of 1 in a DHCPDISCOVER forces the server to broadcast its reply.
>> [!success]- Answer
>> True

> [!question] On Linux, the DHCP server configuration file is /etc/dhcp/dhcp.conf.
>> [!success]- Answer
>> True

> [!question] CSMA/CA is used on wireless networks because a radio cannot transmit and receive at the same time.
>> [!success]- Answer
>> True

> [!question] The Inter-Frame Space priority order is DIFS < PIFS < SIFS.
>> [!success]- Answer
>> False

> [!question] The Network Allocation Vector (NAV) is a timer derived from the Duration field of RTS/CTS frames.
>> [!success]- Answer
>> True

> [!question] The RTS/CTS handshake solves the hidden node problem.
>> [!success]- Answer
>> True

> [!question] In DSSS, binary 1 is encoded with the chip sequence 11101100011.
>> [!success]- Answer
>> True

> [!question] Which command displays the ARP cache on a host?
> a) show mac address-table
> b) arp -a
> c) show ip route
> d) netstat -s
>> [!success]- Answer
> b) arp -a

> [!question] Which command displays the kernel routing table on Linux?
> a) route -n
> b) ip arp show
> c) show ip interface brief
> d) ping -t
>> [!success]- Answer
> a) route -n

> [!question] Which iptables rule implements outbound PAT (masquerading) for the whole internal network?
> a) iptables -t nat -A PREROUTING -p tcp --dport 80 -j DNAT --to-destination 172.16.0.129
> b) iptables -t nat -A POSTROUTING -o eth_wan -j MASQUERADE
> c) iptables -A INPUT -j ACCEPT
> d) iptables -t filter -A FORWARD -j DROP
>> [!success]- Answer
> b) iptables -t nat -A POSTROUTING -o eth_wan -j MASQUERADE

> [!question] Which iptables chain and target publish an internal DMZ web server to the public?
> a) POSTROUTING + MASQUERADE
> b) PREROUTING + DNAT
> c) INPUT + ACCEPT
> d) OUTPUT + SNAT
>> [!success]- Answer
> b) PREROUTING + DNAT

> [!question] A DHCP relay agent is configured on a router with which command?
> a) ip dhcp relay
> b) ip helper-address <server IP>
> c) dhcp forward enable
> d) ip forward-protocol dhcp
>> [!success]- Answer
> b) ip helper-address <server IP>

> [!question] Which state must a DHCP server persist to disk to survive a power failure?
> a) ARP cache entries
> b) Active IP-to-MAC lease bindings and expiration timestamps
> c) The routing table
> d) DNS resolver cache
>> [!success]- Answer
> b) Active IP-to-MAC lease bindings and expiration timestamps

> [!question] When does a DHCP client first attempt to renew its lease (T1)?
> a) At 87.5% of the lease, by broadcasting
> b) At 50% of the lease, by unicasting to the issuing server
> c) At 50% of the lease, by broadcasting to any server
> d) Only when the lease expires
>> [!success]- Answer
> b) At 50% of the lease, by unicasting to the issuing server

> [!question] A PC pings a remote server across two routers. In the frame leaving the first router, which MAC is the destination?
> a) The server's MAC
> b) The second router's ingress interface MAC
> c) The PC's default gateway MAC
> d) FF:FF:FF:FF:FF:FF
>> [!success]- Answer
> b) The second router's ingress interface MAC

> [!question] Which IFS is used by immediate control responses such as ACK and CTS frames?
> a) DIFS
> b) PIFS
> c) SIFS
> d) AIFS
>> [!success]- Answer
> c) SIFS

> [!question] Match the mechanism with its definition.
>> [!example] Group A
>> a) Gratuitous ARP
>> b) NAV
>> c) Split horizon
>
>> [!example] Group B
>> n) Virtual carrier-sensing timer set from the Duration field.
>> o) Client-side address conflict detection after DHCP assignment.
>> p) RIP loop-prevention rule (never advertise a route back out its learning interface).
>
>> [!success]- Answer
>> a) -> o)
>> b) -> n)
>> c) -> p)

> [!question] Match the DHCP message with its direction and transport.
>> [!example] Group A
>> a) DHCPDISCOVER
>> b) DHCPOFFER
>> c) DHCPNAK
>
>> [!example] Group B
>> n) Server response rejecting a client's requested address (e.g., after reboot).
>> o) Client broadcast searching for any DHCP server (UDP 68 to 67).
>> p) Server proposal of an address and parameters.
>
>> [!success]- Answer
>> a) -> o)
>> b) -> p)
>> c) -> n)

> [!question] Match the wireless term with its meaning.
>> [!example] Group A
>> a) CSMA/CA
>> b) DSSS Barker sequence
>> c) Hidden node problem
>
>> [!example] Group B
>> n) Two stations that cannot hear each other collide at the access point.
>> o) Collision avoidance by sensing, waiting (IFS + backoff), then transmitting.
>> p) 11-bit chip sequence spreading each data bit for interference resistance.
>
>> [!success]- Answer
>> a) -> o)
>> b) -> p)
>> c) -> n)

> [!question] Match the Linux/Cisco command with its function.
>> [!example] Group A
>> a) traceroute
>> b) ip nat inside source list 1 pool P overload
>> c) show mac address-table
>
>> [!example] Group B
>> n) Lists learned MAC addresses and their ports on a switch.
>> o) Reveals each Layer 3 hop by exploiting ICMP Time Exceeded replies.
>> p) Cisco PAT configuration binding an ACL to a public pool.
>
>> [!success]- Answer
>> a) -> o)
>> b) -> p)
>> c) -> n)
