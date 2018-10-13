// editor

function Editor(config) {
  this.config = config
  this.view = new View(this.config.name, 800, 400)

  this.buffers = []
  this.scale = 30 / 256
  this.size = 256

  this.buffer = createContext(this.size, this.size, this.scale)
  this.buffer.fillStyle = this.config.clear
  this.buffer.fillRect(0, 0, this.size, this.size)

  var image = new Image()
  image.src = this.config.initial_input
  image.onload = () => {
    this.buffer.save()
    this.buffer.scale(1/this.scale, 1/this.scale)
    this.buffer.drawImage(image, 0, 0)
    this.buffer.restore()
  }

  this.output = createContext(this.size, this.size, this.scale)
  var output = new Image()
  output.src = this.config.initial_output
  output.onload = () => {
    this.output.save()
    this.output.scale(1/this.scale, 1/this.scale)
    this.output.drawImage(output, 0, 0)
    this.output.restore()
  }

  this.progress = null
  this.last_failure = null

  // this.sheet_loaded = false
  // this.sheet = new Image()
  // this.sheet.src = this.config.sheet_url
  // this.sheet.onload = () => {
  //   this.sheet_loaded = true
  //   update()
  // }
  // this.sheet_index = 0
}

Editor.prototype = {
  push_buffer: function() {
    this.buffers.push(this.buffer)
    var buffer = createContext(this.size, this.size, this.scale)
    buffer.save()
    buffer.scale(1/this.scale, 1/this.scale)
    buffer.drawImage(this.buffer.canvas, 0, 0)
    buffer.restore()
    this.buffer = buffer
  },
  pop_buffer: function() {
    if (this.buffers.length == 0) {
      return
    }
    this.buffer = this.buffers.pop()
  },
  render: function() {
    var v = this.view

    v.ctx.clearRect(0, 0, v.f.width, v.f.height)
    v.ctx.save()
    v.ctx.scale(1/SCALE, 1/SCALE)
    v.ctx.drawImage(editor_background, 0, 0)
    v.ctx.restore()

    v.frame("tools", 8, 41, 100, 250, () => {
      var i = 0
      for (var name in this.config.colors) {
        var color = this.config.colors[name]
        v.frame("color_selector", 0, i*21, v.f.width, 20, () => {
          if (v.contains(mouse_pos)) {
            cursor_style = "pointer"
          }

          if (mouse_released && v.contains(mouse_pos)) {
            this.config.draw = color
            update()
          }

          if (this.config.draw == color) {
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
            v.ctx.fillStyle = rgba([0.5, 0.5, 0.5, 1.0])
            v.ctx.stroke()
            v.ctx.restore()
            v.ctx.font = "bold 8pt Arial"
          } else {
            v.ctx.font = "8pt Arial"
          }

          v.ctx.fillText(name, v.f.width - v.ctx.measureText(name).width - 26, 10)

          v.frame("color", v.f.width-25, 0, 20, 20, () => {
            v.ctx.beginPath()
            v.ctx.fillStyle = "#666666"
            v.ctx.arc(10, 10, 9, 0, 2 * Math.PI, false)
            v.ctx.fill()
            v.ctx.beginPath()
            v.ctx.fillStyle = color
            v.ctx.arc(10, 10, 8, 0, 2 * Math.PI, false)
            v.ctx.fill()
          })
        })
        i++
      }
    })

    v.frame("output", 530, 40, 256, 256, () => {
      v.ctx.save()
      v.ctx.scale(1/this.scale, 1/this.scale)
      v.ctx.drawImage(this.output.canvas, 0, 0)
      v.ctx.restore()
    })

    v.frame("input", 140, 40, 256, 256+40, () => {
      v.frame("image", 0, 0, 256, 256, () => {
        v.ctx.drawImage(this.buffer.canvas, 0, 0, v.f.width, v.f.height)
        if (v.contains(mouse_pos)) {
          cursor_style = "crosshair"
          if (this.config.mode == "line" && this.config.draw == "#ffffff") {
            // eraser tool
            cursor_style = "url(/eraser.png) 8 8, auto"
          }
        }

        if (this.config.mode == "line") {
          // this is to make undo work with lines, rather than removing only single frame line segments
          var drag_from_outside = mouse_down && v.contains(mouse_pos) && !v.contains(last_mouse_pos)
          var start_inside = mouse_pressed && v.contains(mouse_pos)
          if (drag_from_outside || start_inside) {
            this.push_buffer()
          }

          if (mouse_down && v.contains(mouse_pos)) {
            var last = v.relative(last_mouse_pos)
            var cur = v.relative(mouse_pos)
            this.buffer.beginPath()
            this.buffer.lineCap = "round"
            this.buffer.strokeStyle = this.config.draw
            if (this.config.draw == "#ffffff") {
              // eraser mode
              this.buffer.lineWidth = 15
            } else {
              this.buffer.lineWidth = 1
            }
            this.buffer.moveTo(last.x, last.y)
            this.buffer.lineTo(cur.x, cur.y)
            this.buffer.stroke()
            this.buffer.closePath()
          }
        } else {
          if (v.contains(drag_start)) {
            var start = v.relative(drag_start)
            var end = v.relative(mouse_pos)
            var width = end.x - start.x
            var height = end.y - start.y
            if (mouse_down) {
              v.ctx.save()
              v.ctx.rect(0, 0, v.f.width, v.f.height)
              v.ctx.clip()
              v.ctx.fillStyle = this.config.draw
              v.ctx.fillRect(start.x, start.y, width, height)
              v.ctx.restore()
            } else if (mouse_released) {
              this.push_buffer()
              this.buffer.fillStyle = this.config.draw
              this.buffer.fillRect(start.x , start.y, width, height)
              v.ctx.drawImage(this.buffer.canvas, 0, 0, v.f.width, v.f.height)
            }
          }
        }
      })
    })

    v.frame("process_button", 461 - 32, 148, 32*2, 40, () => {
      if (this.progress != null) {
        v.ctx.font = "12px Arial"
        v.ctx.fillStyle = "#000"
        var s = "downloading"
        v.ctx.fillText(s, (v.f.width - v.ctx.measureText(s).width)/2, 5)
        s = "model"
        v.ctx.fillText(s, (v.f.width - v.ctx.measureText(s).width)/2, 15)

        v.frame("progress_bar", 0, 25, v.f.width, 15, () => {
          v.ctx.fillStyle = "#f92672"
          v.ctx.fillRect(0, 0, v.f.width * this.progress, v.f.height)
        })
      } else if (request_in_progress) {
        do_button(v, "running")
      } else {
        if (do_button(v, "process")) {
          if (request_in_progress) {
            console.log("request already in progress")
            return
          }
          request_in_progress = true
          this.last_failure = null

          this.progress = 0
          progress_cb = (retrieved, total) => {
            this.progress = retrieved/total
            update()
          }

          fetch_weights(this.config.weights_url, progress_cb).then((weights) => {
            this.progress = null
            update()
            // delay a short period of time so that UI updates before the model uses all the CPU
            delay(() => {
              // var g = new dl.Graph()

              var convert = createContext(30, 30, 1)
              convert.drawImage(this.buffer.canvas, 0, 0, convert.canvas.width, convert.canvas.height)
              var input_uint8_data = convert.getImageData(0, 0, 30, 30).data
              var input_float32_data = Float32Array.from(input_uint8_data, (x) => (x>200)? 1: -1)

              console.time('render')
              const math = dl.ENV.math
              math.startScope()
              var input_rgba = dl.Array3D.new([30, 30, 4], input_float32_data, "float32")
              var input_rgb = math.slice3D(input_rgba, [0, 0, 0], [30, 30, 1])

              var output_rgb = model(input_rgb, weights)
              var min_out = math.min(output_rgb)
              var max_out = math.max(output_rgb)
              output_rgb = math.divide(math.sub(output_rgb,min_out), math.sub(max_out,  min_out))
              var out0 = math.slice3D(output_rgb, [0,0,0],[30,30,1])
              var out1 = math.slice3D(output_rgb, [0,0,1],[30,30,1])
              var out = math.sqrt(math.square(out0), math.square(out1))


              var alpha = dl.Array3D.ones([30, 30, 1])
              var output_rgba = math.concat3D(out, alpha, 2)
              output_rgba = math.concat3D(out, output_rgba, 2)
              output_rgba = math.concat3D(out, output_rgba, 2)

              output_rgba.getValuesAsync().then((output_float32_data) => {
                var output_uint8_data = Uint8ClampedArray.from(output_float32_data, (x) => x * 255)
                let data = new ImageData(output_uint8_data, 30, 30)
                this.output.putImageData(data, 0, 0)
                math.endScope()
                console.timeEnd('render')
                request_in_progress = false
                update()
              })
            })
          }, (e) => {
            this.last_failure = e
            this.progress = null
            request_in_progress = false
            update()
          })
        }
      }
    })

    v.frame("undo_button", 192-32, 310, 64, 40, () => {
      if (do_button(v, "undo")) {
        this.pop_buffer()
        update()
      }
    })

    v.frame("clear_button", 270-32, 310, 64, 40, () => {
      if (do_button(v, "clear")) {
        this.buffers = []
        this.buffer.fillStyle = this.config.clear
        this.buffer.fillRect(0, 0, this.size, this.size)
        this.output.fillStyle = "#FFFFFF"
        this.output.fillRect(0, 0, this.size, this.size)
      }
    })

    if (this.sheet_loaded) {
      v.frame("random_button", 347-32, 310, 64, 40, () => {
        if (do_button(v, "random")) {
          // pick next sheet entry
          this.buffers = []
          var y_offset = this.sheet_index * SIZE
          this.buffer.drawImage(this.sheet, 0, y_offset, SIZE, SIZE, 0, 0, SIZE, SIZE)
          this.output.drawImage(this.sheet, SIZE, y_offset, SIZE, SIZE, 0, 0, SIZE, SIZE)
          this.sheet_index = (this.sheet_index + 1) % (this.sheet.height / SIZE)
          update()
        }
      })
    }

    v.frame("save_button", 655-32, 310, 64, 40, () => {
      if (do_button(v, "save")) {
        // create a canvas to hold the part of the canvas that we wish to store
        var x = 125 * SCALE
        var y = 0
        var width = 800 * SCALE - x
        var height = 310 * SCALE - y
        var convert = createContext(width, height, 1)
        convert.drawImage(v.ctx.canvas, x, y, width, height, 0, 0, convert.canvas.width, convert.canvas.height)
        var data_b64 = convert.canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "")
        var data = b64_to_bin(data_b64)
        var blob = new Blob([data], {type: "application/octet-stream"})
        var url = window.URL.createObjectURL(blob)
        var a = document.createElement("a")
        a.href = url
        a.download = "pix2pix.png"
        // use createEvent instead of .click() to work in firefox
        // also can"t revoke the object url because firefox breaks
        var event = document.createEvent("MouseEvents")
        event.initEvent("click", true, true)
        a.dispatchEvent(event)
        // safari doesn"t work at all
      }
    })

    if (this.last_failure != null) {
      v.frame("server_error", 50, 350, v.f.width, 50, () => {
        v.ctx.font = "20px Arial"
        v.ctx.fillStyle = "red"
        v.center_text(fmt("error %s", this.last_failure))
      })
    }
  },
}
