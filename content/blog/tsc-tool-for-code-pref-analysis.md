---
external: false
draft: false
title: "TSC: Simple and Powerful Tool for Code Profiling"
description: ""
date: 2024-04-02
---

Last week when I was working during my internship in a company which focus on HFT (High-Frequency Trading), I ran into a situation that I need to time a certain part of code which costs a below a hundred nanoseconds. So I would like a tool to give me the system time as accurate as possible. Previously, I alawys use *Intel Vtune® Profiler* to prof code. But this time the server is not equipped with the Intel HPC kit, I instead turned to gperftools, but after a frist try, I don't think it's good enough and it's not really convenient. Later I turned to my team leader for some advice, and he replyed me with a cpu instruction `RDTSCP`.

So, what is `RDTSCP` and how does it work?

Before get into the instruction itself, let's first take a look at the CPU. In the CPU, there are registers. A processor register is a quickly accessible location available to a computer's processor. And among them there is a special register called TSC, Time Stamp Counter, which, obviously, counts the time (Does it?). According to wikiedia, the Time Stamp Counter (TSC) is a 64-bit register present on all x86 processors since the Pentium. It counts the number of CPU cycles since its reset.[$^{[1]}$](https://en.wikipedia.org/wiki/Time_Stamp_Counter) To get the timestamp in the TSC, we can take advantage of the instruction `RDTSC`, which returns the TSC in EDX:EAX (EDX for high-order 32 bits of the TSP and EAX for the low-order 32 bits; On processors that support the Intel 64 architecture, the high-order 32 bits of each of RAX and RDX are cleared).[$^{[2]:547}$](https://www.intel.com/content/dam/www/public/us/en/documents/manuals/64-ia-32-architectures-software-developer-vol-2b-manual.pdf) However, as the manual [[2]](https://www.intel.com/content/dam/www/public/us/en/documents/manuals/64-ia-32-architectures-software-developer-vol-2b-manual.pdf) states: *The `RDTSC` instruction is not a serializing instruction. It does not necessarily wait until all previous instructions have been executed before reading the counter*, which means that the `RDTSC` instruction may not be executed is the same order as the source code requires. So, the manual suggests using either `RDTSCP`, or the sequence `LFENCE;RDTSC`.

Let's just take the simple one `RDTSCP`, which is our main subject of discuession in this blog. According to [[2]:549](https://www.intel.com/content/dam/www/public/us/en/documents/manuals/64-ia-32-architectures-software-developer-vol-2b-manual.pdf), the description for the instruction is: *Read 64-bit time-stamp counter and
IA32_TSC_AUX value into EDX:EAX and ECX*. However, there also something to be noted: ***The `RDTSCP` instruction waits until all previous instructions have been executed before reading the counter.
However, subsequent instructions may begin execution before the read operation is performed.*** It can be considered as some kind of `RDTSC` with partial serialization.

So, above is the basic introdruction of the instruction `RDTSCP`, but with only the basic knowledge of the instruction, we may stumble into pitfalls in practice:

1. The TSC may not increase at a constant rate, the rate may be affected by the freq of the cores. Recent Intel CPUs address this problem by adding a *constant TSP* in the design of the CPU. In linux, the flag `constant_tsc` in `/proc/cpuinfo` indicates the cpu includes a TSC that increases at a constant rate.
2. It is not guaranteed that all cores share the same TSP value.[$^{[3]:3680}$](https://www.intel.com/content/www/us/en/content-details/819723/intel-64-and-ia-32-architectures-software-developer-s-manual-combined-volumes-1-2a-2b-2c-2d-3a-3b-3c-3d-and-4.html) [$^{[3.bak]:3680}$](https://d2pgu9s4sfmw1s.cloudfront.net/UAM/Prod/Done/a06Hu00001gbUvPIAU/f90483c3-0c28-4abe-96a5-71643da39a62?response-content-disposition=inline%3Bfilename*%3DUTF-8%27%27325462-sdm-vol-1-2abcd-3abcd-4.pdf&Expires=2027430553&Key-Pair-Id=APKAJKRNIMMSNYXST6UA&Signature=Iou9co70VdzP3ViDhLP9fNNlbpMUKE5704PW~e43-5kWCDQfZLW1Edn5rDJ3JYy6q-aAq~hmA-JVSIb3kgjHvVzXPo3o3KnBDwBQ9YCqDlR7GkpF3xRxS4tolHNLAPKGqIfthfYN0q2x9fEBgQJFdn4od7oShUhwvrJXls6S9bAncN8VwF0uKpo-ebZqu0-Ymyva73yO1c7wu76cHf-mW0nlJYulNvW6pr1I8bhFGkotldhb-mhEZsOz777pHdKk-CgJPWyo7RaEyY9NqCe0OrdbHapamGYASfWyuD5uAOh2BV6fwT9udIAXsFXeJzy~cciTuKH0BfSV-QVKEPLtFQ__)

The wikipedia states that it is not suggested to use `RDTSCP` for high-resolution timing.

However, in my particular scenario, which:

1. The CPU cores run at a constant freq (constant TSC)
2. The part of code is not long (avoid TSC reset, possibly avoid reading TSC from different cores$^{[citation\ needed]}$)
3. It's a computationally intensive scenario (avoid TSC reset)
