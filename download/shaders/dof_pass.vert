#version 330 core
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;

// Passthrough vertex shader for FBO-to-FBO passes.
// No y-flip, no zoom/pan — v_uv is simply [0,1]x[0,1] across the quad.
// Shaders that read numpy/EXR textures (top-left origin) must flip v_uv.y themselves.
void main() {
    v_uv        = a_pos * 0.5 + vec2(0.5);
    gl_Position = vec4(a_pos, 0.0, 1.0);
}
