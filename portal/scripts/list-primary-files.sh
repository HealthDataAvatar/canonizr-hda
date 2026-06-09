#!/usr/bin/env bash
# Lists primary source files, for use by coding agents.
# Excludes tests, stories, storybook, generated files, and config.

PORTAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

find "$PORTAL_DIR/app" "$PORTAL_DIR/components" "$PORTAL_DIR/lib" \
  -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) \
  ! -path '*__test__*' \
  ! -path '*__tests__*' \
  ! -path '*node_modules*' \
  ! -path '*.storybook*' \
  ! -name '*.stories.*' \
  ! -name '*.test.*' \
  ! -name '*.spec.*' \
  ! -name '*.d.ts' \
  | sort
