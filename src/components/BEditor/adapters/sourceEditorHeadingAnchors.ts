import type { Extension } from '@codemirror/state';
import type { EditorView, ViewUpdate, DecorationSet } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, ViewPlugin } from '@codemirror/view';

export interface SourceHeadingLine {
  from: number;
  id: string;
}

function isFrontMatterDelimiter(line: string): boolean {
  return line.trim() === '---';
}

function isMarkdownHeading(line: string): boolean {
  return /^\s{0,3}#{1,6}\s+\S/.test(line);
}

function getFenceMarker(line: string): string | null {
  const match = line.match(/^\s{0,3}(`{3,}|~{3,})/);
  if (!match) {
    return null;
  }

  return match[1][0];
}

export function getSourceHeadingLines(content: string, anchorIdPrefix: string): SourceHeadingLine[] {
  const lines = content.split(/\r?\n/);
  const headings: SourceHeadingLine[] = [];
  const hasFrontMatter = lines.length > 0 && isFrontMatterDelimiter(lines[0]);
  let inFrontMatter = hasFrontMatter;
  let activeFenceMarker = '';
  let position = 0;
  let headingIndex = 0;

  lines.forEach((line, lineIndex) => {
    const isClosingFrontMatter = inFrontMatter && lineIndex > 0 && isFrontMatterDelimiter(line);
    const fenceMarker = getFenceMarker(line);

    if (fenceMarker) {
      if (!activeFenceMarker) {
        activeFenceMarker = fenceMarker;
      } else if (activeFenceMarker === fenceMarker) {
        activeFenceMarker = '';
      }
    }

    if (!inFrontMatter && !activeFenceMarker && isMarkdownHeading(line)) {
      headings.push({
        from: position,
        id: anchorIdPrefix ? `${anchorIdPrefix}-heading-${headingIndex}` : `heading-${headingIndex}`
      });
      headingIndex += 1;
    }

    if (isClosingFrontMatter) {
      inFrontMatter = false;
    }

    position += line.length + 1;
  });

  return headings;
}

export function getSourceActiveHeadingId(content: string, anchorIdPrefix: string, position: number): string {
  const headings = getSourceHeadingLines(content, anchorIdPrefix);
  let activeId = '';

  headings.forEach((heading) => {
    if (heading.from <= position) {
      activeId = heading.id;
    }
  });

  return activeId;
}

function createHeadingDecorations(view: EditorView, anchorIdPrefix: string): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const headings = getSourceHeadingLines(view.state.doc.toString(), anchorIdPrefix);

  headings.forEach((heading) => {
    builder.add(
      heading.from,
      heading.from,
      Decoration.line({
        attributes: {
          id: heading.id
        }
      })
    );
  });

  return builder.finish();
}

export function createSourceHeadingAnchorExtension(anchorIdPrefix: string): Extension {
  return ViewPlugin.fromClass(
    class SourceHeadingAnchorPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = createHeadingDecorations(view, anchorIdPrefix);
      }

      update(update: ViewUpdate): void {
        if (update.docChanged) {
          this.decorations = createHeadingDecorations(update.view, anchorIdPrefix);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations
    }
  );
}
