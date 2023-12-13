Squid+subgraph API comparator
=============================

A utility that compares APIs of [squids](https://subsquid.io) and [subgraphs](https://thegraph.com). It runs three tests:
1. Schema comparison
2. Temporal entities test: for entities with fields in `['timestamp', 'block', 'blockNumber']` a sample of records is drawn in ascending order from both APIs and the responses are compared.
3. Inclusion test for non-temporal entities: for other entities samples of records are drawn from both APIs, then the other API is checked for having records with the same IDs and if it does, the records are compared.

## Usage

Two executables are currently available

```
npx compare-squid-to-subgraph <subgraph_url> <squid_url>
```
```
npx compare-subgraph-to-subgraph <reference_subgraph_url> <sample_subgraph_url>
```

## Limitations

May ignore or work incorrectly with entities that have JSON fields.
