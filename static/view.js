// immediate mode UI

function View(name, width, height) {
  this.ctx = createContext(width, height, SCALE)
	// https://developer.apple.com/library/safari/documentation/AudioVideo/Conceptual/HTML-canvas-guide/AddingText/AddingText.html
  this.ctx.textBaseline = "middle"
  this.frames = [{name: name, offset_x: 0, offset_y: 0, width: width, height: height}]
  this.f = this.frames[0]
}

View.prototype = {
  push_frame: function(name, x, y, width, height) {
    this.ctx.save()
    this.ctx.translate(x, y)
  	var current = this.frames[this.frames.length - 1]
  	var next = {name: name, offset_x: current.offset_x + x, offset_y: current.offset_y + y, width: width, height: height}
  	this.frames.push(next)
    this.f = next
  },
  pop_frame: function() {
    this.ctx.restore()
    this.frames.pop()
    this.f = this.frames[this.frames.length - 1]
  },
  frame: function(name, x, y, width, height, func) {
    this.push_frame(name, x, y, width, height)
    func()
    this.pop_frame()
  },
  frame_path: function() {
    var parts = []
    for (var i = 0; i < this.frames.length; i++) {
      parts.push(this.frames[i].name)
    }
    return parts.join(".")
  },
  relative: function(pos) {
    // adjust x and y relative to the top left corner of the canvas
    // then adjust relative to the current frame
    var rect = this.ctx.canvas.getBoundingClientRect()
    return {x: pos.x - rect.left - this.f.offset_x, y: pos.y - rect.top - this.f.offset_y}
  },
  contains: function(pos) {
    // first check that position is inside canvas container
    var rect = this.ctx.canvas.getBoundingClientRect()
    if (pos.x < rect.left || pos.x > rect.left + rect.width || pos.y < rect.top || pos.y > rect.top + rect.height) {
      return false
    }
    // translate coordinates to the current frame
    var rel = this.relative(pos)
    return 0 < rel.x && rel.x < this.f.width && 0 < rel.y && rel.y < this.f.height
  },
  put_image_data: function(d, x, y) {
    this.ctx.putImageData(d, (x + this.f.offset_x) * SCALE, (y + this.f.offset_y) * SCALE)
  },
  center_text: function(s) {
    this.ctx.fillText(s, (this.f.width - this.ctx.measureText(s).width)/2, this.f.height/2)
  },
}
