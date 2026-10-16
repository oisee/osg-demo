# 20. The tools come home: abaplint in ABAP

open-steamgate activates your ABAP through abaplint, Lars Hvam's ABAP
parser and linter written in TypeScript, and its transpiler. Chapter 18 took
other languages into ABAP for the fun of it. This chapter takes in abaplint
itself, translated into ABAP, running inside an ABAP application server.

The translator is [abapiti](https://github.com/oisee/abapiti/tree/v0.5.2), the same
project as in chapter 18. What follows is abapiti's
[README at the tag v0.5.2](https://github.com/oisee/abapiti/blob/v0.5.2/README.md)
and its record
[abaplint's whole test suite on three runtimes](https://github.com/oisee/abapiti/blob/b5b19ec/docs/history/2026-10-15-abaplint-tests-on-three-runtimes.md);
this chapter did not repeat the SAP runs.

## The road

abapiti reads abaplint's TypeScript with the tsgo checker, so it starts
from the types the checker worked out, not from the text. It lowers the program into a typed object representation of its own,
the HIR, and writes it out in one of two ways:

- as ABAP classes and interfaces, readable and importable with abapGit;
- as Go, for a fast native build of the same program.

The two outputs come from the same HIR. Neither is a translation of the
other.

## The test

A translated linter is only worth something if it gives the same answers.
abapiti does not judge that itself. It takes abaplint's own test suite, the
mocha and chai tests abaplint's authors wrote, and compiles them together
with the core through a small shim, without rewriting a test by hand.

The reference is a Node run of the same tests at the same commit of abaplint
(`577f875e`, `@abaplint/core` 2.120.56): 11,092 registered, of which 32 are
skipped upstream. That leaves 11,060. Every result on every host is matched
title by title against the Node run.

| Host | What runs | Passing | Wrong answers |
|---|---|---:|---:|
| Go | abaplint translated to Go | **11,060** of 11,060 | 0 |
| open-steamgate's Go runtime (osgo) | abaplint translated to ABAP | **11,060** of 11,060 | 0 |
| SAP NetWeaver 7.58 (A4H) | the same ABAP on a real kernel | **11,060** of 11,060 | 0 |

The suite has seventeen shards; the largest are the statement parser (4,962
tests), the rules (3,149) and the syntax checker (1,363). On A4H the
translated abaplint is 2,338 classes, and its tests another 5,015; all of
them activate without a syntax error, and the longest shards run 24 minutes
(rules) and 22 minutes (statements) as background jobs.

The road there, in passing tests on the Go build, as abapiti's README logs
it: 0, 27, 661, 6,515, 9,022, 10,167, … 11,051, **11,060**.

## What the kernel refused

The first full run on A4H passed 11,055 tests. The five others tripped
over an empty regular expression: JavaScript's `new RegExp("")` accepts
one, and the SAP kernel refuses an empty POSIX regex. abapiti now writes an
empty pattern as `(?:)`, which means the same and which the kernel accepts. It is the same kind of finding as chapter 18's
list of what the kernel refuses: code that every other runtime takes, and a
real system does not.

## The linter checks abapGit

A linter in ABAP is not only a test result. abapiti's README measures the
translated abaplint at work: checking `zabapgit_standalone.prog.abap`, all
159K lines of abapGit in one report, plus its dependencies, with abapGit's
own abaplint configuration. On every host the issues it reports equal those
of the original abaplint on Node, byte for byte.

| Where abaplint runs | Time |
|---|---:|
| translated to ABAP, SAP 7.58 kernel, as a background job | 171.5–179.3 s |
| translated to ABAP, open-steamgate's Go runtime (osgo) | 14.3–17.2 s |
| translated to ABAP, one native executable built by open-steamgate | 17–20 s |
| translated to ABAP, open-steamgate's JavaScript runtime | 85 min |
| translated to Go | 7.9 s |
| the original, on Node | 14.0 s |

These are abapiti v0.3 (`f9d5f8c`) with open-steamgate `7720f6e2` (the
JavaScript runtime: `6e10128e`). The Go runtime, the native build, Go and
Node ran on one Linux machine, 16-core in abapiti's words, with other jobs
running; A4H is a separate machine. On this program
the JavaScript runtime took 85 minutes; the Go runtime took a quarter of a
minute.

## What comes next

abapiti does more than translate. **GRACE**, the engine inside it, derives
facts about the program over the HIR (who calls whom, what is read, what is
changed) and runs rewrites, such as inlining, on top of those facts, with
termination, idempotence and equal incremental and full results verified. abapiti's records
([engine](https://github.com/oisee/abapiti/blob/v0.5.2/docs/history/2026-10-10-grace-engine.md),
[inline flag](https://github.com/oisee/abapiti/blob/v0.5.2/docs/history/2026-10-10-grace-inline-flag.md))
show its first job: the same inlining as before, with a byte-identical
output.

There is also a separate project in the abaplint organisation,
[abaplint-abap-classic](https://github.com/abaplint/abaplint-abap-classic):
abaplint for the classic ABAP Code Inspector and ATC, installed with abapGit
and switched on in transaction SCI. Its README calls it a beta for
experimental use.

## Run it yourself

The Go build needs no SAP system and no open-steamgate: only Node (this
book used 24.21.0) and Go 1.26.0 on the `PATH`, abapiti at the tag `v0.5.2`,
and abaplint at `577f875e`:

```
git clone https://github.com/abaplint/abaplint /path/to/abaplint
cd /path/to/abaplint && git checkout 577f875e
npm ci
cd packages/core && npm ci

git clone --branch v0.5.2 https://github.com/oisee/abapiti /path/to/abapiti
cd /path/to/abapiti
node tools/abaplint-tests-all.mjs /path/to/abaplint out.json
```

It compiles all seventeen shards to Go, runs them against the Node run of
the same tests, and prints a table per shard. This book ran it from the tag
on an Intel Core i7-10700K (8 cores, 16 threads, about 126 GiB of memory), Node 24.21.0 and Go
1.26.0, with other jobs on the machine; it took 49 minutes 27 seconds and
ended:

```
| rules | 3149 | 0 | 0 | 0 | 10 | 3159 | 3149+10 pending |
| utils | 15 | 0 | 0 | 0 | 0 | 15 | 15+0 pending |
| TOTAL | 11060 | 0 | 0 | 0 | 32 | 11092 | 11060+32 pending |
11060/11060 (Node-active only); Node total including pending: 11092
```

The columns are passed, failed, trapped, async pending, not run, registered,
and what Node itself did with the shard's tests.

The ABAP build runs on the two other hosts too:

- **osgo.** This needs open-steamgate at `f83dc5c3`, its development line,
  newer than this book's tag:

  ```
  git clone https://github.com/oisee/open-steamgate /path/to/open-steamgate
  cd /path/to/open-steamgate && git checkout f83dc5c3
  npm ci && node tools/osd-libs.mjs
  cd /path/to/abapiti
  ABAPITI_TESTS_TARGET=osg ABAPITI_OSG_HOME=/path/to/open-steamgate \
    node tools/abaplint-tests-all.mjs /path/to/abaplint out-osg.json
  ```

  The same
  system is published as one OCI index
  (`ghcr.io/oisee/abapiti/zlnt-system:v0.5.2`); installing it with
  `osd-fetch --system` also needs open-steamgate's development line.
- **A real SAP system.** Import the release's abapGit archives in the order
  [abapiti's guide](https://github.com/oisee/abapiti/blob/v0.5.2/docs/a4h-test-suite.md)
  gives, run report `ZLNT_TESTS_RUN` per shard as a background job, and
  reconcile table `ZLNT_TESTRUN` against the Node run with abapiti's tools.
