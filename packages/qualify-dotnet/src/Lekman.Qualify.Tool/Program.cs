using Lekman.Qualify.Cli;

// Wiring only: the commands live in the library and are covered by its tests.
return QualifyCommands.Run(args, new SystemCliIO());
