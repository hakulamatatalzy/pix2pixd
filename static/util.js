// utility

function createContext(width, height, scale) {
    var canvas = document.createElement("canvas")
    canvas.width = width * scale
    canvas.height = height * scale
    stylize(canvas, {
      width: fmt("%dpx", width),
      height: fmt("%dpx", height),
      margin: "10px auto 10px auto",
    })
    var ctx = canvas.getContext("2d")
    ctx.scale(scale, scale)
    return ctx
  }
  
  function b64_to_bin(str) {
    var binstr = atob(str)
    var bin = new Uint8Array(binstr.length)
    for (var i = 0; i < binstr.length; i++) {
      bin[i] = binstr.charCodeAt(i)
    }
    return bin
  }
  
  function delay(fn) {
    setTimeout(fn, 0)
  }
  
  function default_format(obj) {
    if (typeof(obj) === "string") {
      return obj
    } else {
      return JSON.stringify(obj)
    }
  }
  
  function fmt() {
    if (arguments.length === 0) {
      return "error"
    }
  
    var format = arguments[0]
    var output = ""
  
    var arg_index = 1
    var i = 0
  
    while (i < format.length) {
      var c = format[i]
      i++
  
      if (c != "%") {
        output += c
        continue
      }
  
      if (i === format.length) {
        output += "%!(NOVERB)"
        break
      }
  
      var flag = format[i]
      i++
  
      var pad_char = " "
  
      if (flag == "0") {
        pad_char = "0"
      } else {
        // not a flag
        i--
      }
  
      var width = 0
      while (format[i] >= "0" && format[i] <= "9") {
        width *= 10
        width += parseInt(format[i], 10)
        i++
      }
  
      var f = format[i]
      i++
  
      if (f === "%") {
        output += "%"
        continue
      }
  
      if (arg_index === arguments.length) {
        output += "%!" + f + "(MISSING)"
        continue
      }
  
      var arg = arguments[arg_index]
      arg_index++
  
      var o = null
  
      if (f === "v") {
        o = default_format(arg)
      } else if (f === "s" && typeof(arg) === "string") {
        o = arg
      } else if (f === "T") {
        o = typeof(arg)
      } else if (f === "d" && typeof(arg) === "number") {
        o = arg.toFixed(0)
      } else if (f === "f" && typeof(arg) === "number") {
        o = arg.toString()
      } else if (f === "x" && typeof(arg) === "number") {
        o = Math.round(arg).toString(16)
      } else if (f === "t" && typeof(arg) === "boolean") {
        if (arg) {
          o = "true"
        } else {
          o = "false"
        }
      } else {
        output += "%!" + f + "(" + typeof(arg) + "=" + default_format(arg) + ")"
      }
  
      if (o !== null) {
        if (o.length < width) {
          output += Array(width - o.length + 1).join(pad_char)
        }
        output += o
      }
    }
  
    if (arg_index < arguments.length) {
      output += "%!(EXTRA "
      while (arg_index < arguments.length) {
        var arg = arguments[arg_index]
        output += typeof(arg) + "=" + default_format(arg)
        if (arg_index < arguments.length - 1) {
          output += ", "
        }
        arg_index++
      }
      output += ")"
    }
  
    return output
  }
  
  