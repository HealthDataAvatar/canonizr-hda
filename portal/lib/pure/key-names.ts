import {
  uniqueNamesGenerator,
  adjectives,
  animals,
} from "unique-names-generator";

export function generateKeyName(): string {
  return `agent-${uniqueNamesGenerator({
    dictionaries: [adjectives, animals],
    separator: "-",
    length: 2,
    style: "lowerCase",
  })}`;
}
