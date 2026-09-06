# qa-toolkit

> My testing patterns, practices and tools

Testing patterns and practices, in two halves. The runnable half lives in
`packages/`: TypeScript built with Bun and published for Node, starting with a
test data generator. The reasoning half lives in `practices/`: why each tool
exists, what it costs, and when not to use it. Each package pairs with one
practice.

## Start Here

- **[@lekman/data-sampler](packages/data-sampler/README.md)**:
  classification-first JSON test data. Define grades, choose a spread, and
  generate records that satisfy each grade.

## Related

- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md): how to work in this repo.
- [lekman/ai-toolkit](https://github.com/lekman/ai-toolkit): practices for
  working with Claude, and the source of this repo's tooling conventions.
