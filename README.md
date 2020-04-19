# smartchr

Insert several candidates with a single key.

- Vim https://www.vim.org/scripts/script.php?script_id=2290
- Emacs https://github.com/imakado/emacs-smartchr

## Features

- DEMO Video(Emacs) - https://vimeo.com/7832017

## Extension Settings

* `smartchr.definitions`: smartchr keybinding definitions (JSON)
  * property (language ID) : 
    * property (key text) : array of toggle patterns
      * `!!` indicates the cursor insertion position

Example:

```json
    "smartchr.definitions": {
        "javascript": {
            "F": ["F","$","$(!!)"],
            ">": [">","ev => {!!}",">>"],
            "L": ["L","let ","LL"],
        },
        "go": {
            ":" : [":", " := ", "::"]
        }
    }
```
