var editor_background = new Image()
editor_background.src = "editor.png"

var DEBUG = true
var SIZE = 30

var editors = []
var request_in_progress = false

function main() {
  var create_editor = function(config) {
    var editor = new Editor(config)
    var elem = document.getElementById(config.name)
    elem.appendChild(editor.view.ctx.canvas)
    editors.push(editor)
  }


  create_editor({
    name: "facades",
    weights_url: "/models/out_model.bin",
    mode: "rect",
    colors: {
      background: "#0006d9",
      wall: "#0d3dfb",
      door: "#a50000",
      "window": "#0075ff",
      "window sill": "#68f898",
      "window head": "#1dffdd",
      shutter: "#eeed28",
      balcony: "#b8ff38",
      trim: "#ff9204",
      cornice: "#ff4401",
      column: "#f60001",
      entrance: "#00c9ff",
    },
    clear: "#000000",
    draw: "#007500",
    initial_input: "/facades-input-umm.png",
    initial_output: "/facades-output-umm.png",
    sheet_url: "/facades-sheet.jpg",
  })

  window.requestAnimationFrame(frame)
}
window.onload = main

function render() {
  for (var i = 0; i < editors.length; i++) {
    editors[i].render()
  }
}


// model

var weights_cache = {}
function fetch_weights(path, progress_cb) {
  return new Promise(function(resolve, reject) {
    if (path in weights_cache) {
      resolve(weights_cache[path])
      return
    }

    var xhr = new XMLHttpRequest()
    xhr.open("GET", path, true)
    xhr.responseType = "arraybuffer"

    xhr.onprogress = function(e) {
      progress_cb(e.loaded, e.total)
    }

    xhr.onload = function(e) {
      if (xhr.status != 200) {
        reject("missing model")
        return
      }
      var buf = xhr.response
      if (!buf) {
        reject("invalid arraybuffer")
        return
      }

      var parts = []
      var offset = 0
      while (offset < buf.byteLength) {
        var b = new Uint8Array(buf.slice(offset, offset+4))
        offset += 4
        var len = (b[0] << 24) + (b[1] << 16) + (b[2] << 8) + b[3]
        parts.push(buf.slice(offset, offset + len))
        offset += len
      }

      var shapes = JSON.parse((new TextDecoder("utf8")).decode(parts[0]))
      var index = new Float32Array(parts[1])
      var encoded = new Uint8Array(parts[2])

      // decode using index
      var arr = new Float32Array(encoded.length)
      for (var i = 0; i < arr.length; i++) {
        arr[i] = index[encoded[i]]
      }

      var weights = {}
      var offset = 0
      for (var i = 0; i < shapes.length; i++) {
        var shape = shapes[i].shape
        var size = shape.reduce((total, num) => total * num)
        var values = arr.slice(offset, offset+size)
        var dlarr = dl.Array1D.new(values, "float32")
        weights[shapes[i].name] = dlarr.reshape(shape)
        offset += size
      }
      weights_cache[path] = weights
      resolve(weights)
    }
    xhr.send(null)
  })
}

function model(input, weights) {
  const math = dl.ENV.math

  function preprocess(input) {
    return math.subtract(math.multiply(input, dl.Scalar.new(2)), dl.Scalar.new(1))
  }

  function deprocess(input) {
    return math.divide(math.add(input, dl.Scalar.new(1)), dl.Scalar.new(2))
  }

  function batchnorm(input, scale, offset) {
    var moments = math.moments(input, [0, 1])
    const varianceEpsilon = 1e-5
    return math.batchNormalization3D(input, moments.mean, moments.variance, varianceEpsilon, scale, offset)
  }

  function conv2d(input, filter, bias) {
    return math.conv2d(input, filter, bias, [2, 2], "same")
  }

  // function deconv2d(input, filter, bias) {
  //   var convolved = math.conv2dTranspose(input, filter, [input.shape[0]*2, input.shape[1]*2, filter.shape[2]], [2, 2], "same")
  //   var biased = math.add(convolved, bias)
  //   return biased
  // }

  function deconv2d(input, filter, bias, a, b, pattern) {
    var convolved = math.conv2dTranspose(input, filter, [a, b, filter.shape[2]], [2, 2], pattern)
    var biased = math.add(convolved, bias)
    return biased
  }

  var preprocessed_input = preprocess(input)

  var layers = []

  //var filter = weights["generator/encoder_1/conv2d/kernel"]
  //var bias = weights["generator/encoder_1/conv2d/bias"]
  var filter = weights["generator/generator/conv2d/kernel"]
  var bias = weights["generator/generator/conv2d/bias"]
  var convolved = conv2d(preprocessed_input, filter, bias)
  layers.push(convolved)


  var scope1 = "generator/generator/conv2d_1"
  var filter = weights[scope1 + "/kernel"]
  var bias = weights[scope1 + "/bias"]
  var layer_input = layers[layers.length - 1]
  var rectified = math.leakyRelu(layer_input, 0.2)
  var convolved = conv2d(rectified, filter, bias)
  var scope2 = "generator/generator/batch_normalization"
  var scale = weights[scope2 + "/gamma"]
  var offset = weights[scope2 + "/beta"]
  var normalized = batchnorm(convolved, scale, offset)
  layers.push(normalized)


  for (var i = 2; i <= 4; i++) {
    var scope1 = "generator/generator/conv2d_" + i.toString()
    var filter = weights[scope1 + "/kernel"]
    var bias = weights[scope1 + "/bias"]
    var layer_input = layers[layers.length - 1]
    var rectified = math.leakyRelu(layer_input, 0.2)
    var convolved = conv2d(rectified, filter, bias)
    var scope2 = `generator/generator/batch_normalization_${i-1}`
    var scale = weights[scope2 + "/gamma"]
    var offset = weights[scope2 + "/beta"]
    var normalized = batchnorm(convolved, scale, offset)
    layers.push(normalized)
  }

  ///////////////////////////////////////////


  var layer_input = layers[layers.length - 1]
  var rectified = math.relu(layer_input)
  var scope1 = "generator/generator/conv2d_transpose"
  var filter = weights[scope1 + "/kernel"]
  var bias = weights[scope1 + "/bias"]
  var convolved = deconv2d(rectified, filter, bias, 2, 2, 'same')
  var scope2 = "generator/generator/batch_normalization_4"
  var scale = weights[scope2 + "/gamma"]
  var offset = weights[scope2 + "/beta"]
  var normalized = batchnorm(convolved, scale, offset)
  // missing dropout
  layers.push(normalized)


//   for (var i = 4; i >= 1; i--) {
//     var skip_layer = i - 1
//     var layer_input = math.concat3D(layers[layers.length - 1], layers[skip_layer], 2)
//     var rectified = math.relu(layer_input)
//     var scope1 = `generator/generator/conv2d_transpose_${5-i}`
//     var filter = weights[scope1 + "/kernel"]
//     var bias = weights[scope1 + "/bias"]
//     if (i = 4) {
//       var convolved = deconv2d(rectified, filter, bias, 2, 2, 'same')
//     } else if (i = 3) {
//       var convolved = deconv2d(rectified, filter, bias, 4, 4, 'same')
//     } else if (i = 2) {
//       var convolved = deconv2d(rectified, filter, bias, 7, 7, 'valid')
//     } else {
//       var convolved = deconv2d(rectified, filter, bias, 15, 15, 'same')
//     }
//     // var convolved = deconv2d(rectified, filter, bias)
//     var scope2 = `generator/generator/batch_normalization_${9-i}`
//     var scale = weights[scope2 + "/gamma"]
//     var offset = weights[scope2 + "/beta"]
//     var normalized = batchnorm(convolved, scale, offset)
//     // missing dropout
//     layers.push(normalized)
//   }

//   var output = layers[layers.length - 1]
//   //var deprocessed_output = deprocess(output)

// ////////////////////////////////////

i = 4
var skip_layer = i - 1
var layer_input = math.concat3D(layers[layers.length - 1], layers[skip_layer], 2)
var rectified = math.relu(layer_input)
var scope1 = `generator/generator/conv2d_transpose_${5-i}`
var filter = weights[scope1 + "/kernel"]
var bias = weights[scope1 + "/bias"]
var convolved = deconv2d(rectified, filter, bias, 4, 4, 'same')
// var convolved = deconv2d(rectified, filter, bias)
var scope2 = `generator/generator/batch_normalization_${9-i}`
var scale = weights[scope2 + "/gamma"]
var offset = weights[scope2 + "/beta"]
var normalized = batchnorm(convolved, scale, offset)
// missing dropout
layers.push(normalized)



i = 3
var skip_layer = i - 1
var layer_input = math.concat3D(layers[layers.length - 1], layers[skip_layer], 2)
var rectified = math.relu(layer_input)
var scope1 = `generator/generator/conv2d_transpose_${5-i}`
var filter = weights[scope1 + "/kernel"]
var bias = weights[scope1 + "/bias"]
var convolved = deconv2d(rectified, filter, bias, 8, 8, 'same')
// var convolved = deconv2d(rectified, filter, bias)
var scope2 = `generator/generator/batch_normalization_${9-i}`
var scale = weights[scope2 + "/gamma"]
var offset = weights[scope2 + "/beta"]
var normalized = batchnorm(convolved, scale, offset)
// missing dropout
layers.push(normalized)



i = 2
var skip_layer = i - 1
var layer_input = math.concat3D(layers[layers.length - 1], layers[skip_layer], 2)
var rectified = math.relu(layer_input)
var scope1 = `generator/generator/conv2d_transpose_${5-i}`
var filter = weights[scope1 + "/kernel"]
var bias = weights[scope1 + "/bias"]
var convolved = deconv2d(rectified, filter, bias, 15, 15, 'valid')
// var convolved = deconv2d(rectified, filter, bias)
var scope2 = `generator/generator/batch_normalization_${9-i}`
var scale = weights[scope2 + "/gamma"]
var offset = weights[scope2 + "/beta"]
var normalized = batchnorm(convolved, scale, offset)
// missing dropout
layers.push(normalized)


i = 1
var skip_layer = i - 1
var layer_input = math.concat3D(layers[layers.length - 1], layers[skip_layer], 2)
var rectified = math.relu(layer_input)
var scope1 = `generator/generator/conv2d_transpose_${5-i}`
var filter = weights[scope1 + "/kernel"]
var bias = weights[scope1 + "/bias"]
var convolved = deconv2d(rectified, filter, bias, 30, 30, 'same')
// var convolved = deconv2d(rectified, filter, bias)
var scope2 = `generator/generator/batch_normalization_${9-i}`
var scale = weights[scope2 + "/gamma"]
var offset = weights[scope2 + "/beta"]
var normalized = batchnorm(convolved, scale, offset)
// missing dropout
layers.push(normalized)

var output = layers[layers.length - 1]
//var deprocessed_output = deprocess(output)

////////////////////////////////////





  return output
}


var SCALE = 2

var updated = true
var frame_rate = 0
var now = new Date()
var last_frame = new Date()
var animations = {}
var values = {}

var cursor_style = null
var mouse_pos = [0, 0]
var last_mouse_pos = [0, 0]
var drag_start = [0, 0]
var mouse_down = false
var mouse_pressed = false
var mouse_released = false

if (DEBUG) {
  var fps_elem = document.createElement("div")
  stylize(fps_elem, {
    width: "300px",
    height: "20px",
    margin: "5px",
    fontFamily: "Monaco",
    fontSize: "12px",
    position: "absolute",
    top: fmt("%dpx", 10),
    right: fmt("%dpx", 10),
  })
  document.body.insertBefore(fps_elem, document.body.firstChild)

  var status_elem = document.createElement("div")
  stylize(status_elem, {
    width: "10px",
    height: "10px",
    margin: "5px",
    position: "absolute",
    top: fmt("%dpx", 10),
    left: fmt("%dpx", 10),
  })
  document.body.insertBefore(status_elem, document.body.firstChild)
}


function do_button(v, text) {
  name = v.frame_path()

  if (v.contains(mouse_pos)) {
    cursor_style = "pointer"
  }

  if (request_in_progress) {
    animate(name, parse_color("#aaaaaaFF"), 100)
  } else if (mouse_down && v.contains(mouse_pos)) {
    animate(name, parse_color("#FF0000FF"), 50)
  } else {
    if (v.contains(mouse_pos)) {
      animate(name, parse_color("#f477a5FF"), 100)
    } else {
      animate(name, parse_color("#f92672FF"), 100)
    }
  }

  v.ctx.save()
  var radius = 5
  v.ctx.beginPath()
  v.ctx.moveTo(radius, 0)
  var sides = [v.f.width, v.f.height, v.f.width, v.f.height]
  for (var i = 0; i < sides.length; i++) {
    var side = sides[i]
    v.ctx.lineTo(side - radius, 0)
    v.ctx.arcTo(side, 0, side, radius, radius)
    v.ctx.translate(side, 0)
    v.ctx.rotate(90 / 180 * Math.PI)
  }
  v.ctx.fillStyle = rgba(calculate(name))
  v.ctx.fill()
  v.ctx.restore()

  v.ctx.font = "16px Arial"
  v.ctx.fillStyle = "#f8f8f8"
  v.center_text(text)

  if (request_in_progress) {
    return false
  }

  return mouse_released && v.contains(mouse_pos) && v.contains(drag_start)
}

function stylize(elem, style) {
  for (var key in style) {
    elem.style[key] = style[key]
  }
}

function update() {
  updated = true
}

function frame() {
  var raf = window.requestAnimationFrame(frame)

  if (!updated && Object.keys(animations).length == 0) {
    if (DEBUG) {
      status_elem.style.backgroundColor = "black"
    }
    return
  }
  if (DEBUG) {
    status_elem.style.backgroundColor = "red"
  }

  now = new Date()
  cursor_style = null
  updated = false

  try {
    render()
  } catch (e) {
    window.cancelAnimationFrame(raf)
    throw e
  }

  if (cursor_style == null) {
    document.body.style.cursor = "default"
  } else {
    document.body.style.cursor = cursor_style
  }

  if (DEBUG) {
    var decay = 0.9
    var current_frame_rate = 1 / ((now - last_frame) / 1000)
    frame_rate = frame_rate * decay + current_frame_rate * (1 - decay)
    fps_elem.textContent = fmt("fps: %d", frame_rate)
  }

  last_frame = now
  last_mouse_pos = mouse_pos
  mouse_pressed = false
  mouse_released = false
}

function array_equal(a, b) {
  if (a.length != b.length) {
    return false
  }

  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) {
      return false
    }
  }
  return true
}

function animate(name, end, duration) {
  if (values[name] == undefined) {
    // no value has been set for this element, set it immediately
    values[name] = end
    return
  }

  var v = calculate(name)
  if (array_equal(v, end)) {
    return
  }
  if (duration == 0) {
    delete animations[name]
    values[name] = end
    return
  }
  var a = animations[name]
  if (a != undefined && array_equal(a.end, end)) {
    return
  }
  animations[name] = {time: now, start: v, end: end, duration: duration}
}

function calculate(name) {
  if (values[name] == undefined) {
    throw "calculate used before calling animate"
  }

  var a = animations[name]
  if (a != undefined) {
    // update value
    var t = Math.min((now - a.time)/a.duration, 1.0)
    t = t*t*t*(t*(t*6 - 15) + 10) // smootherstep
    var result = []
    for (var i = 0; i < a.start.length; i++) {
      result[i] = a.start[i] + (a.end[i] - a.start[i]) * t
    }
    if (t == 1.0) {
      delete animations[name]
    }
    values[name] = result
  }
  return values[name]
}

function rgba(v) {
  return fmt("rgba(%d, %d, %d, %f)", v[0] * 255, v[1] * 255, v[2] * 255, v[3])
}

var parse_color = function(c) {
	return [
		parseInt(c.substr(1,2), 16) / 255,
		parseInt(c.substr(3,2), 16) / 255,
		parseInt(c.substr(5,2), 16) / 255,
    parseInt(c.substr(7,2), 16) / 255,
	]
}

document.addEventListener("mousemove", function(e) {
  mouse_pos = {x: e.clientX, y: e.clientY}
  update()
})

document.addEventListener("mousedown", function(e) {
  drag_start = {x: e.clientX, y: e.clientY}
  mouse_down = true
  mouse_pressed = true
  update()
})

document.addEventListener("mouseup", function(e) {
  mouse_down = false
  mouse_released = true
  update()
})