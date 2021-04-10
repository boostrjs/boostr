import wrap from 'wrap-ansi';

import {resolveVariables} from './util.js';

const MAXIMUM_TERMINAL_WIDTH = Math.min(100, process.stdout.columns);

export type Sections = {[name: string]: string | string[] | Record<string, string>};

export function formatHelp(
  sections: Sections,
  {variables = {}}: {variables?: Record<string, any>} = {}
) {
  let result = '\n';

  for (const [name, content] of Object.entries(sections)) {
    if (result !== '\n') {
      result += '\n';
    }

    result += name + ':\n';

    if (typeof content === 'string') {
      result += formatHelpString(content, {variables});
    } else if (Array.isArray(content)) {
      result += formatHelpString(content.join('\n'), {variables});
    } else {
      result += formatHelpObject(content, {variables});
    }
  }

  return result;
}

export function formatHelpString(
  string: string,
  {variables = {}}: {variables?: Record<string, any>} = {}
) {
  string = resolveVariables(string, variables);

  let result = wrap(string, MAXIMUM_TERMINAL_WIDTH - 2, {hard: true});

  result = indentString(result, 2) + '\n';

  return result;
}

export function formatHelpObject(
  object: Record<string, string>,
  {variables = {}}: {variables?: Record<string, any>} = {}
) {
  let maximumNameWidth = 0;

  for (const [name] of Object.entries(object)) {
    if (name.length > maximumNameWidth) {
      maximumNameWidth = name.length;
    }
  }

  let result = '';

  for (let [name, content] of Object.entries(object)) {
    content = resolveVariables(content, variables);
    result += name + ' '.repeat(maximumNameWidth - name.length) + '  ';
    result += indentString(
      wrap(content, MAXIMUM_TERMINAL_WIDTH - maximumNameWidth - 2 - 2, {hard: true}),
      maximumNameWidth + 2,
      {skipFirstLine: true}
    );
    result += '\n';
  }

  result = indentString(result, 2);

  return result;
}

export function indentString(string: string, indentation: number, {skipFirstLine = false} = {}) {
  const indentationString = ' '.repeat(indentation);

  let result = !skipFirstLine ? indentationString : '';

  result += string.split('\n').join('\n' + indentationString);

  return result;
}
