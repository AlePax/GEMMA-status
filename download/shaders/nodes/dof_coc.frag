#version 330 core

// Pass 1 of the DoF pyramid: depth → raw CoC map.
// Input texture is numpy/EXR top-left origin → v_uv.y is flipped here.
// Output: CoC in R channel [0..1], bokeh_power already applied.
// A Gaussian smooth pass follows to soften depth-edge transitions.

uniform sampler2D u_tex;      // depth buffer (numpy top-left origin)
uniform float u_focus_pct;    // 0..100 — focus plane depth percentile
uniform float u_focus_range;  // 0.1..100 — transition width beyond flat zone
uniform float u_focus_flat;   // 0..100 — flat sharp zone width (CoC=0 within ±half)
uniform float u_bokeh_power;  // 0.5..4.0
uniform float u_depth_lo;     // normalised depth at 1st percentile
uniform float u_depth_hi;     // normalised depth at 99th percentile

in  vec2 v_uv;
out vec4 frag_color;

void main() {
    // Y-flip: depth tex is numpy top-left; dof_pass.vert gives v_uv with no flip.
    vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);

    float coc = 0.0;
    if (u_depth_hi > u_depth_lo + 1e-3) {
        float span       = max(u_depth_hi - u_depth_lo, 1e-9);
        float half_range = max(u_focus_range * 0.5, 0.05);
        float flat_half  = u_focus_flat * 0.5;

        float raw   = texture(u_tex, uv).r;
        float d_pct = (raw <= 1e-6) ? 100.0
                    : clamp((raw - u_depth_lo) / span * 100.0, 0.0, 100.0);

        float dist    = max(0.0, abs(d_pct - u_focus_pct) - flat_half);
        float coc_raw = clamp(dist / half_range, 0.0, 1.0);
        coc = (u_bokeh_power != 1.0) ? pow(coc_raw, u_bokeh_power) : coc_raw;
    }

    frag_color = vec4(coc, 0.0, 0.0, 1.0);
}
