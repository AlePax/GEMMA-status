#version 330 core
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;

uniform vec2  u_scale;
uniform float u_zoom;   // 1.0 = fit, >1 = zoom in
uniform vec2  u_pan;    // UV offset from center (0,0 = centered)

// y-flip corrects EXR top-left origin vs. GL bottom-left origin.
// Aspect correction via /u_scale keeps the image ratio correct while allowing
// zoom > 1 to expand beyond the fit-to-viewport box (image fills the viewport).
void main() {
    float h = 0.5 / u_zoom;
    v_uv = vec2(
        a_pos.x * h / u_scale.x + 0.5 + u_pan.x,
        1.0 - (a_pos.y * h / u_scale.y + 0.5 + u_pan.y)
    );
    gl_Position = vec4(a_pos, 0.0, 1.0);
}
