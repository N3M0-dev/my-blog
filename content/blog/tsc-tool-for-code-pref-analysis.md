---
external: false
draft: false
tags: [HPC ,Hardware, CPU]
title: "TSC: Simple and Powerful Tool for Code Profiling"
description: "Something fun about RDTSC and RDTSCP."
date: 2024-04-02
---
Last week when I was working during my internship in a company which focus on HFT (High-Frequency Trading), I ran into a situation that I need to time a certain part of code which costs a below a hundred nanoseconds. So I would like a tool to give me the system time as accurate as possible. Previously, I alawys use *Intel Vtune® Profiler* to prof code. But this time the server is not equipped with the Intel HPC kit, I instead turned to gperftools, but after a frist try, I don't think it's good enough and it's not really convenient. Later I turned to my team leader for some advice, and he replyed me with a cpu instruction `RDTSCP`.

So, what is `RDTSCP` and how does it work?

Before get into the instruction itself, let's first take a look at the CPU. In the CPU, there are registers. A processor register is a quickly accessible location available to a computer's processor. And among them there is a special register called TSC, Time Stamp Counter, which, obviously, counts the time (Does it?). According to wikiedia, the Time Stamp Counter (TSC) is a 64-bit register present on all x86 processors since the Pentium. It counts the number of CPU cycles since its reset. {% sup %}[[1]](https://en.wikipedia.org/wiki/Time_Stamp_Counter){% /sup %} To get the timestamp in the TSC, we can take advantage of the instruction `RDTSC`, which returns the TSC in EDX:EAX (EDX for high-order 32 bits of the TSP and EAX for the low-order 32 bits; On processors that support the Intel 64 architecture, the high-order 32 bits of each of RAX and RDX are cleared).{% sup %}[[2]:547](https://www.intel.com/content/dam/www/public/us/en/documents/manuals/64-ia-32-architectures-software-developer-vol-2b-manual.pdf){% /sup %} However, as the manual [[2]](https://www.intel.com/content/dam/www/public/us/en/documents/manuals/64-ia-32-architectures-software-developer-vol-2b-manual.pdf) states: *The `RDTSC` instruction is not a serializing instruction. It does not necessarily wait until all previous instructions have been executed before reading the counter*, which means that the `RDTSC` instruction may not be executed is the same order as the source code requires. So, the manual suggests using either `RDTSCP`, or the sequence `LFENCE;RDTSC`.

Let's just take the simple one, `RDTSCP`, which is our main subject of discuession in this blog. According to [[2]:549](https://www.intel.com/content/dam/www/public/us/en/documents/manuals/64-ia-32-architectures-software-developer-vol-2b-manual.pdf), the description for the instruction is: *Read 64-bit time-stamp counter and IA32_TSC_AUX value into EDX:EAX and ECX*. However, there also something to be noted: ***The `RDTSCP` instruction waits until all previous instructions have been executed before reading the counter. However, subsequent instructions may begin execution before the read operation is performed.*** It can be considered as some kind of `RDTSC` with partial serialization.

So, above is the basic introdruction of the instruction `RDTSCP`, but with only the basic knowledge of the instruction, we may stumble into pitfalls in practice:

1. The TSC may not increase at a constant rate, the rate may be affected by the freq of the cores. Recent Intel CPUs address this problem by adding a *constant TSP* in the design of the CPU. In linux, the flag `constant_tsc` in `/proc/cpuinfo` indicates the cpu includes a TSC that increases at a constant rate.
2. It is not guaranteed that all cores share the same TSP value.{% sup %}[[3]:3680](https://www.intel.com/content/www/us/en/content-details/819723/intel-64-and-ia-32-architectures-software-developer-s-manual-combined-volumes-1-2a-2b-2c-2d-3a-3b-3c-3d-and-4.html) [[3.bak]:3680](https://d2pgu9s4sfmw1s.cloudfront.net/UAM/Prod/Done/a06Hu00001gbUvPIAU/f90483c3-0c28-4abe-96a5-71643da39a62?response-content-disposition=inline%3Bfilename*%3DUTF-8%27%27325462-sdm-vol-1-2abcd-3abcd-4.pdf&Expires=2027430553&Key-Pair-Id=APKAJKRNIMMSNYXST6UA&Signature=Iou9co70VdzP3ViDhLP9fNNlbpMUKE5704PW~e43-5kWCDQfZLW1Edn5rDJ3JYy6q-aAq~hmA-JVSIb3kgjHvVzXPo3o3KnBDwBQ9YCqDlR7GkpF3xRxS4tolHNLAPKGqIfthfYN0q2x9fEBgQJFdn4od7oShUhwvrJXls6S9bAncN8VwF0uKpo-ebZqu0-Ymyva73yO1c7wu76cHf-mW0nlJYulNvW6pr1I8bhFGkotldhb-mhEZsOz777pHdKk-CgJPWyo7RaEyY9NqCe0OrdbHapamGYASfWyuD5uAOh2BV6fwT9udIAXsFXeJzy~cciTuKH0BfSV-QVKEPLtFQ__){% /sup %}

The wikipedia states that it is not suggested to use `RDTSCP` for high-resolution timing.

However, in my particular scenario, which:

1. The CPU cores run at a constant freq (constant TSC)
2. The part of code is not long (avoid TSC reset)
3. It's a computationally intensive scenario (avoid TSC reset)
4. That code segment is single-threaded and bounds to a certain core (avoid reading TSC from different cores)

So, in conclusion, in the scenario I encountered, it's valid to utilize the `RDTSCP` for timing purposes. But notice one thing, the `RDTSCP` instruction is not guaranteed to be executed before the subsequent instructions. That is:

```mermaid
lfence                       lfence
rdtsc     --- ALLOWED -->    B
B                            rdtsc

rdtscp    --- ALLOWED -->    B
B                            rdtscp
```

So, in the end, to solve this problem, we still cannot escape form `LFENCE`, which performs a serializing operation on all load-from-memory instructions that were issued prior the LFENCE instruction and no later instruction begins execution until LFENCE complete.{%sup%}[[3]:1196](https://www.intel.com/content/www/us/en/content-details/819723/intel-64-and-ia-32-architectures-software-developer-s-manual-combined-volumes-1-2a-2b-2c-2d-3a-3b-3c-3d-and-4.html) [[3.bak]:1196](https://d2pgu9s4sfmw1s.cloudfront.net/UAM/Prod/Done/a06Hu00001gbUvPIAU/f90483c3-0c28-4abe-96a5-71643da39a62?response-content-disposition=inline%3Bfilename*%3DUTF-8%27%27325462-sdm-vol-1-2abcd-3abcd-4.pdf&Expires=2027430553&Key-Pair-Id=APKAJKRNIMMSNYXST6UA&Signature=Iou9co70VdzP3ViDhLP9fNNlbpMUKE5704PW~e43-5kWCDQfZLW1Edn5rDJ3JYy6q-aAq~hmA-JVSIb3kgjHvVzXPo3o3KnBDwBQ9YCqDlR7GkpF3xRxS4tolHNLAPKGqIfthfYN0q2x9fEBgQJFdn4od7oShUhwvrJXls6S9bAncN8VwF0uKpo-ebZqu0-Ymyva73yO1c7wu76cHf-mW0nlJYulNvW6pr1I8bhFGkotldhb-mhEZsOz777pHdKk-CgJPWyo7RaEyY9NqCe0OrdbHapamGYASfWyuD5uAOh2BV6fwT9udIAXsFXeJzy~cciTuKH0BfSV-QVKEPLtFQ__){%/sup%} By following `LFENCE` after `RDTSCP`, now we can time code segment accurately.

```mermaid
rdtscp                           B
lfense    --- NOT ALLOWED -->    rdtscp
B                                lfense
```

Problem now solved. By the way, when talking about timing code segments, I've also used a tool in the cpp standard library, named chrono, which can return nanoseconds. Maybe it have something to do with the TSC discussed in this blog, I'll try to find out later. That's all for now.
