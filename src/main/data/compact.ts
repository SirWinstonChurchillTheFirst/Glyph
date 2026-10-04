// Parser for the compact text format some OP.GG tools answer in:
//
//   class Runes: id,play,win
//   class Data: runes,items
//
//   Data(Runes(8112,18729,9201),[...])
//
// Class lines name the fields; the last line is one expression of class calls, arrays,
// JSON strings, numbers and literals. The result is plain objects keyed by field name.

export function parseCompact(text: string): unknown {
  const classes = new Map<string, string[]>()
  const lines = text.split('\n')
  let line = 0
  for (; line < lines.length; line++) {
    const match = /^class (\w+): (.*)$/.exec(lines[line])
    if (match) classes.set(match[1], match[2].split(','))
    else if (lines[line].trim() !== '') break
  }

  const source = lines.slice(line).join('\n')
  let at = 0
  const fail = (): never => {
    throw new Error(`Unerwartetes Datenformat an Position ${at}.`)
  }
  const skip = (): void => {
    while (at < source.length && /\s/.test(source[at])) at++
  }

  /** Comma-separated values up to `close`. */
  function list(close: string): unknown[] {
    const values: unknown[] = []
    skip()
    if (source[at] === close) {
      at++
      return values
    }
    for (;;) {
      values.push(value())
      skip()
      const next = source[at++]
      if (next === close) return values
      if (next !== ',') fail()
    }
  }

  function value(): unknown {
    skip()
    const start = source[at]

    if (start === '"') {
      let end = at + 1
      while (end < source.length && source[end] !== '"') end += source[end] === '\\' ? 2 : 1
      const parsed: unknown = JSON.parse(source.slice(at, end + 1))
      at = end + 1
      return parsed
    }
    if (start === '[') {
      at++
      return list(']')
    }

    const word = /^[A-Za-z_]\w*/.exec(source.slice(at, at + 80))?.[0]
    if (word) {
      at += word.length
      if (source[at] === '(') {
        at++
        const values = list(')')
        const fields = classes.get(word) ?? fail()
        return Object.fromEntries(fields.map((field, index) => [field, values[index]]))
      }
      if (word === 'true' || word === 'True') return true
      if (word === 'false' || word === 'False') return false
      if (word === 'null' || word === 'None') return null
      return fail()
    }

    const number = /^-?\d+(\.\d+)?([eE][-+]?\d+)?/.exec(source.slice(at, at + 40))?.[0]
    if (number === undefined) return fail()
    at += number.length
    return Number(number)
  }

  const result = value()
  skip()
  if (at !== source.length) fail()
  return result
}
