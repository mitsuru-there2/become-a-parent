extends SceneTree

const Sim = preload("res://game/simulation.gd")

# Private local protocol: snapshots never go directly to the public CLI.
func _initialize() -> void:
	while true:
		var header = read_exact(12)
		if header.size() != 12: break
		var length = header.get_string_from_ascii().to_int()
		if length <= 0 or length > 134217728: break
		var packet = read_exact(length)
		if packet.size() != length: break
		var request = JSON.parse_string(packet.get_string_from_utf8())
		if request == null:
			print(JSON.stringify({"error": "INVALID_REQUEST"}))
			continue
		request = integers(request)
		if request.op == "quit": break
		var s = request.get("state", {})
		match request.op:
			"new": s = Sim.start(request.scenario, request.seed)
			"advance": Sim.advance(s)
			"fixture-advance": Sim.advance(s, request.draw)
			"fixture-open": Sim.open_turn(s)
			"fixture-adult":
				Sim.Adult.finish(s, Sim.draw)
				s.phase = "finished"
			"observe": pass
			_:
				print(JSON.stringify({"error": "UNKNOWN_OPERATION"}))
				continue
		var view = Sim.public_view(s)
		print(JSON.stringify({"state": s, "view": view}))
	quit()

func read_exact(size: int) -> PackedByteArray:
	var result = PackedByteArray()
	while result.size() < size:
		var part = OS.read_buffer_from_stdin(size - result.size())
		if part.is_empty(): break
		result.append_array(part)
	return result

# Godot JSON numbers are floats; game arithmetic deliberately uses integers.
func integers(value):
	if typeof(value) == TYPE_FLOAT: return int(value)
	if value is Array:
		for i in value.size(): value[i] = integers(value[i])
	elif value is Dictionary:
		for key in value: value[key] = integers(value[key])
	return value
