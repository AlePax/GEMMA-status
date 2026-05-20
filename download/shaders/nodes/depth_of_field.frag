#version 330 core

uniform sampler2D u_tex;     // TEXTURE0 — sharp image (pre-DoF)
uniform sampler2D u_tex2;    // TEXTURE1 — depth buffer
uniform float u_ev;
uniform float u_gamma;
uniform int   u_tonemap;
uniform int   u_channel;

// DoF params
uniform float u_focus_pct;    // 0..100  — where in depth range to focus
uniform float u_focus_range;  // 0.1..100
uniform float u_max_blur;     // effective blur radius in texture-space pixels
                              // (= raw max_blur * pixel_scale, pre-scaled by MainWindow)
uniform float u_bokeh_power;  // 0.5..4.0
// Depth percentile range (pre-computed CPU-side, same validity mask as CPU DoF: d > 1e-6)
uniform float u_depth_lo;     // normalised depth at 1st percentile of foreground pixels
uniform float u_depth_hi;     // normalised depth at 99th percentile of foreground pixels

in  vec2 v_uv;
out vec4 frag_color;

vec3 tm_reinhard(vec3 c)  { return c / (c + vec3(1.0)); }
vec3 tm_aces(vec3 c) {
    const float a=2.51, b=0.03, cc=2.43, d=0.59, e=0.14;
    return clamp((c*(a*c+b))/(c*(cc*c+d)+e), 0.0, 1.0);
}
vec3 tm_uncharted2(vec3 c) {
    const float A=.15,B=.50,C=.10,D=.20,E=.02,F=.30,W=11.2;
    #define UC2(x) ((x*(A*x+C*B)+D*E)/(x*(A*x+B)+D*F)) - E/F
    return clamp(2.0*UC2(c) / UC2(W), 0.0, 1.0);
}

void main() {
    if (v_uv.x < 0.0 || v_uv.x > 1.0 || v_uv.y < 0.0 || v_uv.y > 1.0) {
        frag_color = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // Compute mip LOD from CoC.
    // Guard: when depth range not yet initialised (u_depth_hi ≈ u_depth_lo) show sharp.
    float lod = 0.0;
    if (u_depth_hi > u_depth_lo + 1e-3) {
        float span       = max(u_depth_hi - u_depth_lo, 1e-9);
        float half_range = max(u_focus_range * 0.5, 0.05);
        vec2  d_off      = (1.0 / vec2(textureSize(u_tex2, 0))) * max(2.0, u_max_blur * 0.12);

        // Sample depth at 5 taps
        float r0 = texture(u_tex2, v_uv).r;
        float r1 = texture(u_tex2, v_uv + vec2(d_off.x,    0.0)).r;
        float r2 = texture(u_tex2, v_uv - vec2(d_off.x,    0.0)).r;
        float r3 = texture(u_tex2, v_uv + vec2(0.0,    d_off.y)).r;
        float r4 = texture(u_tex2, v_uv - vec2(0.0,    d_off.y)).r;

        // d_pct per tap (sky/void pixels with depth ≤ 1e-6 → 100%)
        float p0 = (r0 <= 1e-6) ? 100.0 : clamp((r0 - u_depth_lo) / span * 100.0, 0.0, 100.0);
        float p1 = (r1 <= 1e-6) ? 100.0 : clamp((r1 - u_depth_lo) / span * 100.0, 0.0, 100.0);
        float p2 = (r2 <= 1e-6) ? 100.0 : clamp((r2 - u_depth_lo) / span * 100.0, 0.0, 100.0);
        float p3 = (r3 <= 1e-6) ? 100.0 : clamp((r3 - u_depth_lo) / span * 100.0, 0.0, 100.0);
        float p4 = (r4 <= 1e-6) ? 100.0 : clamp((r4 - u_depth_lo) / span * 100.0, 0.0, 100.0);

        // CoC per tap, then average (4:1:1:1:1 weights — centre-heavy).
        // Average CoC not depth: when both sides of a depth edge are at CoC=1.0 the
        // average stays 1.0 — no artificial low-CoC ring / bright sharp outline.
        float k0 = clamp(abs(p0 - u_focus_pct) / half_range, 0.0, 1.0);
        float k1 = clamp(abs(p1 - u_focus_pct) / half_range, 0.0, 1.0);
        float k2 = clamp(abs(p2 - u_focus_pct) / half_range, 0.0, 1.0);
        float k3 = clamp(abs(p3 - u_focus_pct) / half_range, 0.0, 1.0);
        float k4 = clamp(abs(p4 - u_focus_pct) / half_range, 0.0, 1.0);

        float coc_raw = (k0 * 4.0 + k1 + k2 + k3 + k4) / 8.0;
        float coc     = (u_bokeh_power != 1.0) ? pow(coc_raw, u_bokeh_power) : coc_raw;

        lod = coc * log2(max(u_max_blur, 1.0));
    }

    vec3  col = textureLod(u_tex, v_uv, lod).rgb;
    float alp = textureLod(u_tex, v_uv, 0.0).a;   // alpha always from sharp layer

    col *= pow(2.0, u_ev);

    if      (u_channel == 1) col = vec3(col.r);
    else if (u_channel == 2) col = vec3(col.g);
    else if (u_channel == 3) col = vec3(col.b);
    else if (u_channel == 4) col = vec3(alp);

    if (u_channel == 0) {
        if      (u_tonemap == 0) col = tm_reinhard(col);
        else if (u_tonemap == 1) col = tm_aces(col);
        else if (u_tonemap == 2) col = tm_uncharted2(col);
        else                     col = clamp(col, 0.0, 1.0);
    } else {
        col = col / (col + vec3(1.0));
    }

    col        = pow(clamp(col, 0.0, 1.0), vec3(1.0 / u_gamma));
    frag_color = vec4(col, 1.0);
}
