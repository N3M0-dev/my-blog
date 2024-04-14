---
external: false
draft: false
title: "Rambling About std::atomic"
description: ""
date: 2024-04-10
tags: [Cpp, Cpp std]
---

I've heard the word **atomic** in programming for a long time, without actually knowing what it means. Until recently I've been learn about practising concurrency in cpp and actually encountered `std::atomic` in the codebase which I am currently performing optimization on.

So, I guess it's high time I dived into it.

## Definition of std::atomic

Concepts and definitions below are heavily referred to cppreference:

```cpp
/// Defined in header <atomic>
template< class T >                         // (1) since C++11
struct atomic;

template< class U >                         // (2) since C++11
struct atomic<U*>;

/// Defined in header <memory>
template< class U >                         // (3) since C++20
struct atomic<std::shared_ptr<U>>;

template< class U >                         // (4) since C++20
struct atomic<std::weak_ptr<U>>;

/// Defined in header <stdatomic.h>     
#define _Atomic<_Tp> ::std::atomic<_Tp>     // (5) since C++23
```

I's worth noting that I'm actually not familiar with the new stuff of Cpp, like the brand new pointers in definition (3) & (4). ~~(Maybe write about them when I've got time)~~

Above are the defs of `std::atomic`. And from cppreference:

Each instantiation and full specialization of the std::atomic template defines an atomic type. If one thread writes to an atomic object while another thread reads from it, the behavior is well-defined (see *memory model* {%sub%}see below{%/sub%} for details on data races).

In addition, accesses to atomic objects may establish inter-thread synchronization and order non-atomic memory accesses as specified by `std::memory_order` {%sub%}see below{%/sub%}.

`std::atomic` is neither copyable nor movable.{%sup%} [[1]](https://en.cppreference.com/w/cpp/atomic/atomic) {%/sup%}

## The Cpp memory model

For those who may not be familiar with the *computer organization*, a memory model is how the programming language interacts with the virtual memory in the language's abstract machine, regardless of what actually happens on the hardwares like DRAM, CPU and etc. In C++, the memory model can be described as follows:{%sup%}[[2]](https://en.cppreference.com/w/cpp/language/memory_model){%/sup%}:

1. Byte:

    A *byte* is the smallest addressable unit of memory. It is defined as a contiguous sequence of bits, of size of 8 or greater (due to my narrow perspective, I've never encounter the latter situation).

2. Memory Location:

    A *memory location* is:
    - an object of scalar type, or
    - the largest contiguous sequence of bit-fields of non-zero length.

3. Threads and data races:

    When an evaluation{%sup%}[[3]](https://en.cppreference.com/w/cpp/language/eval_order){%/sup%} of an expression modifies a memory location and another evaluation reads or modifies the same memory location, the expressions are said to conflict. A program that has two conflicting evaluations has a data race unless:
    - both evaluations execute on the same thread or in the same signal handler, or
    - both conflicting evaluations are atomic operations{%sub%}[see below]{%/sub%}, or
    - one of the conflicting evaluations happens-before another{%sub%}[see below]{%/sub%}.

There're still something not covered here, but those are too tedious to discuss and these above are enough for now.

## std::memory_order

```cpp
typedef enum memory_order {                     // since C++11
    memory_order_relaxed,                       // until C++20
    memory_order_consume,
    memory_order_acquire,
    memory_order_release,
    memory_order_acq_rel,
    memory_order_seq_cst
} memory_order;

enum class memory_order : /* unspecified */ {   // since C++20
    relaxed, consume, acquire, release, acq_rel, seq_cst
};
inline constexpr memory_order memory_order_relaxed = memory_order::relaxed;
inline constexpr memory_order memory_order_consume = memory_order::consume;
inline constexpr memory_order memory_order_acquire = memory_order::acquire;
inline constexpr memory_order memory_order_release = memory_order::release;
inline constexpr memory_order memory_order_acq_rel = memory_order::acq_rel;
inline constexpr memory_order memory_order_seq_cst = memory_order::seq_cst;
```

First, let's ~~briefly~~ outline the usage of std::memory_order for {%mark%}reference purposes only{%/mark%}:

| Value                 | Explanation |
| :-------------------- | :---------- |
| memory_order_relaxed  | Relaxed operation: there are no synchronization or ordering constraints imposed on other reads or writes, only this operation's atomicity is guaranteed (see Relaxed ordering below).                                           |
| memory_order_consume  | A load operation with this memory order performs a consume operation on the affected memory location: no reads or writes in the current thread dependent on the value currently loaded can be reordered before this load. |
| memory_order_acquire  | A load operation with this memory order performs the acquire operation on the affected memory location: no reads or writes in the current thread can be reordered before this load. All writes in other threads that release the same atomic variable are visible in the current thread (see Release-Acquire ordering below). |
| memory_order_release  | A store operation with this memory order performs the release operation: no reads or writes in the current thread can be reordered after this store. All writes in the current thread are visible in other threads that acquire the same atomic variable (see Release-Acquire ordering below) and writes that carry a dependency into the atomic variable become visible in other threads that consume the same atomic (see Release-Consume ordering below). |
| memory_order_acq_rel  | A read-modify-write operation with this memory order is both an acquire operation and a release operation. No memory reads or writes in the current thread can be reordered before the load, nor after the store. All writes in other threads that release the same atomic variable are visible before the modification and the modification is visible in other threads that acquire the same atomic variable. |
| memory_order_seq_cst  | A load operation with this memory order performs an acquire operation, a store performs a release operation, and read-modify-write performs both an acquire operation and a release operation, plus a single total order exists in which all threads observe all modifications in the same order (see Sequentially-consistent ordering below). |

Above all, we need know why we have `std::memory_order` and what problem this rule is aimed to solve.

Due to the compiler and CPU out-of-order execution, the actual memory access order happening on the CPU cores may differ from apparent memory access order in the code within the constraints of the memory model. So without further constraints, the memory order is kinda unpredictable for the programmer. This is why the `std::memory_order` has come into existance.

We will illustrate this using the code snippets below:

#### The Self-Increment Example

First, let's consider a simple situation, where we might want to implement an increment operation on a variable by multiple threads, concurrently.

```cpp
#include <iostream>
#include <thread>
#include <vector>
 
int cnt = 0;
 
void f()
{
    for (int n = 0; n < 100000; ++n)
        cnt++;
}
 
int main()
{
    std::vector<std::thread> v;
    for (int n = 0; n < 10; ++n)
        v.emplace_back(f);
    for (auto& t : v)
        t.join();
    std::cout << "Final counter value is " << cnt << '\n';
}
```

> For some superfast CPUs at a high frequency, the iterate time 100000 may not be large enough, if you run this program with curiosity and find that the outcome is consistently 1000000, that might be the problem. The iteration is already over before the next thread starts. So the program actually fallbacks to a normal sequential program. I'm explaining this now to avoid future repetition.

##### The output. Incorrect, why?

The result from the stdout differs every time I run this program and definitely cannot be correct as intendeted, like:

```text
Final counter value is 741319
Final counter value is 315474
Final counter value is 229830
Final counter value is 343942
Final counter value is 404900
Final counter value is 267274
Final counter value is 317795
......
```

The final value should be 1000000 as intended! Why here all outputs are smaller than it?

To grasp this, let's delve into the specifics of the self-increment operation.

The accomplish the self-increment, what do you think the computer need to do? For a naive understanding, the computer should somehow obtain the value and use it as an input of the addition circuit, and then write the output to memory. I guess that's pretty much the case, right? Actually, that's true, but to confirm that, we need the assembly code:

```armasm
0 .LBB0_2:
1         adrp    x9, cnt
2         ldr     w8, [x9, :lo12:cnt]
3         add     w8, w8, #1
4         str     w8, [x9, :lo12:cnt]
5         b       .LBB0_3
```

Above is the assembly code generated on my platform (MBP M1, clang 17.0.6, -g -O0), the assembly may vary on different platforms or different compilers and its versions.

For those who is not familiar with assembly code, I'll briefly introduce the code:

- Line 1: The `adrp` instr. calculates the page address where the var. `cnt` locates.
- Line 2: The `ldr` instr. loads the data from the address `[x9, :lo12:cnt]` to register `w8`, where you can think `[x9, :lo12:cnt]` as the address of the cnt, regadless of the in depth syntax and reason.
- Line 3: The `add` instr. adds `w8`(2nd) with the value of `1`(#1) and stores the value in `w8`(1st).
- Line 4: The `str` instr. stores the value to the address of the `cnt`, which is  
`[x9, :lo12:cnt]`.
- Line 5: Jump to another control flow, which is here the for loop.

As we can see the from the assembly, the process of a self-increment operation is actually what I mentioned earlier. And by having aquired enough knowledge of the work behind the scene, we can now reveal why the outcome is much smaller than the expected 1000000.

In the C++ code, we start a thread one after another, without waiting the former thread to stop, which leaves possibility for the following to happen: **Two addition operation may happen at the same time!** So the above assembly code is being runned concurrently, on multiple cores, and there may be multiple threads running on the same core. So this might happen:

1. When performing the increment, more than one threads first fetches the current value of the var. `cnt` and add 1 and store it back to memory at the same time.
    During this, the `cnt` should be increased by the number of the threads, but end up increased by 1.
2. When performing the increment, one thread has already fetched the `cnt` in the register but have't stored it in the memory before another thread fetches it. This causes cnt smaller by 1 than it should be.
3. When performing the increment, one thread may be slower than others due to extra load on the core it runs on, so maybe when others have added 10 to `cnt` it only adds 1 to it and then stored it back to the memory, causing it smaller by 10 than it should be.
4. ... There may still be some other situations that are not covered here.

#### Got it, but how to fix it?

Introducing `std::atomic`...

By the name **atomic**, it means it is the minimum operation that cannot be divided. By using a atomic object, operations involving the atomic object are guaranteed to be indivisible. That is, considering the situation above, if the increment operation is atomic, then: No access to the memory can happen at the same time causing conflict, since it's not allowed to write memory from outside the atomic operation to a address that will be accessed by the atomic operation, or the atomicity will be broken. The word atomic stand for indivisible from the outside, nothing outside can happen together with the atomic operation at the same time, or in the middle of it, leaving no space for the unexpected situation mentioned above.

Sounds a little complicated, but the C++ standard library makes it relatively easy:

```cpp
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>
 
std::atomic<int> cnt = {0};
 
void f()
{
    for (int n = 0; n < 1000; ++n)
        cnt.fetch_add(1, std::memory_order_relaxed);
}
 
int main()
{
    std::vector<std::thread> v;
    for (int n = 0; n < 10; ++n)
        v.emplace_back(f);
    for (auto& t : v)
        t.join();
    std::cout << "Final counter value is " << cnt << '\n';
}
```

By warping the type/class/struct you want to make it atomic, it's basically done! Now the increment operation is atomic, and produces the correct result.

As you might have noticed, there's something new in the code `std::memory_order_relaxed`. What is this? What is memory order?

#### std::memory_order_relaxed

Besides `std::atomic`, it is also important to order the memory access during runtime, for since nothing is allowed to violate the atomicity, the operations conflicting should have to be placed in a defined order, or the program is still more or less unpredictable.

In this situation, no matter how the memory order is, the result is not affected, so the considering one specific atomic opeartion, how other operations are ordered does not matter, what I care is the ensurance of atomicity of the current atomic operation. This is `std::memory_order_relaxed`.

#### std::memory_order_release && std::memory_order_aquire

For a formal and overall detailed definition of these memory orders, refer to the tabel above, here I would like to share my understanding of the tow memory orders. 

Frist, `std::memory_order_release`: The word "release" have the following definition in the dictionary: *allow (information) to be generally available*. Here `std::memory_order_release` means release all changes to the shared memory that all others can see the changes. So if a atomic var. is stored in thread *A*, and another thread *B* loads this var. (or anything depends on it), then the load is guaranteed to execute after the store and all memory writes in thread *A* cannot be ordered after the atomic store with `std::memory_order_release`. And also, this guarantee happens at compile time{%sup%}[confirmation needed]{%/sup%}, so the order written in the code is reliable.

Then, `std::memory_order_aquire`: This is quite simple, it "aquires" what has been "released" to shared memory, it will wait until the store of the release done and then load it. It also prevents all reads and writes to be reordered before the aquire.

```cpp
#include <atomic>
#include <cassert>
#include <chrono>
#include <string>
#include <thread>

std::atomic<std::string *> ptr;
int data;

void producer() {
  std::this_thread::sleep_for(std::chrono::seconds(2));
  std::string *p = new std::string("Hello");
  data = 42;
  ptr.store(p, std::memory_order_release);
}

void consumer() {
  std::string *p2;
  while (!(p2 = ptr.load(std::memory_order_acquire)))
    ;
  assert(*p2 == "Hello"); // never fires
  assert(data == 42);     // never fires
}

int main() {
  std::thread t2(consumer);
  std::thread t1(producer);

  t1.join();
  t2.join();
}
```

#### std::memory_order_consume

This memory order is kinda like the `std::memory_order_aquire`, but it only prevents reads and writes of data depends on the atomic object, not all. This memory order, on most platforms, do not have much actual meaning, it may affect the compiler optimization only. That's because on most platforms, dependency ordering of reads and writes are already implemented on sth. with the CPU. However, on platforms that don't have dependency ordering or it's not automatic, the consume does generate acutal binary.

#### std::memory_order_seq_cst

This memory order means sequentially consistent memory order by the name. Atomic operations tagged memory_order_seq_cst not only order memory the same way as release/acquire ordering (everything that happened-before a store in one thread becomes a visible side effect in the thread that did a load), but also establish a *single total modification order* of all atomic operations that are so tagged.

Briefly speaking, this means that all threads agree on the order in which memory_order_seq_cst operations occur, even if these operations happen on different objects. It guarantees a very strong order of operations, however with the cost of performance overhead, which is caused by synchronization between threads and prevents compiler optimization.

## Conclusion

Basically, the term `std::atomic` means the indivisibility of a opeartion, just like in chemical reactions, the atomic is the smallest unit of matter. However, there's no magic making a operation atomic, the `std::atomic` just wraps around it and protects it, just like there are still protons, neutrons and electrons in atoms. Then comes the problem of how to reorder conflicting atomic operations and sychronization, the standard library accomplishes this by using memory orders. Different orders applied on the atomic operations will affect how other atomic operations are ordered around it.
