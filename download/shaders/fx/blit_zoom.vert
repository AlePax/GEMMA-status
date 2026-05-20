#version 330 core
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;

uniform vec2  u_scale;
uniform float u_zoom;
uniform vec2  u_pan;

// Reads from an FBO (GL origin = bottom-left = image bottom).
// No y-flip needed: a_pos.y=-1 (screen bottom) → v_uv.y=0 → image bottom.
// /u_scale un-distorts the FBO content (which was rendered at 1:1 into the FBO)
// while allowing zoom > 1 to expand the image beyond the fit-to-viewport box.
void main() {
    float h = 0.5 / u_zoom;
    v_uv = vec2(
        a_pos.x * h / u_scale.x + 0.5 + u_pan.x,
        a_pos.y * h / u_scale.y + 0.5 + u_pan.y
    );
    gl_Position = vec4(a_pos, 0.0, 1.0);
}
