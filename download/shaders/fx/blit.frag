#version 330 core
uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 frag_color;
void main() {
    if (v_uv.x < 0.0 || v_uv.x > 1.0 || v_uv.y < 0.0 || v_uv.y > 1.0) {
        frag_color = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    frag_color = texture(u_tex, v_uv);
}
