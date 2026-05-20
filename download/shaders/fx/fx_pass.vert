#version 330 core
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
uniform vec2 u_scale;
void main() {
    v_uv        = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos * u_scale, 0.0, 1.0);
}
