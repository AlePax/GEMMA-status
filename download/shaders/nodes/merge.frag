#version 330 core

uniform sampler2D u_tex;    // TEXTURE0 — A input (top layer)
uniform sampler2D u_tex2;   // TEXTURE1 — B input (base layer)
uniform sampler2D u_tex3;   // TEXTURE2 — mask (optional)
uniform float u_ev;
uniform float u_gamma;
uniform int   u_tonemap;
uniform int   u_channel;

// Merge params
uniform int   u_mode;       // 0=over 1=add 2=multiply 3=screen 4=lighten
                             // 5=darken 6=overlay 7=softlight 8=color 9=luma
uniform float u_opacity;    // 0..1
uniform int   u_has_mask;   // 0=no mask, 1=mask connected

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

// W3C blend-mode helpers (Rec.601 luminance, same as CPU node)
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 clip_color(vec3 c) {
    float l  = lum(c);
    float mn = min(c.r, min(c.g, c.b));
    float mx = max(c.r, max(c.g, c.b));
    if (mn < 0.0) c = l + (c - l) * l / (l - mn + 1e-9);
    if (mx > 1.0) c = l + (c - l) * (1.0 - l) / (mx - l + 1e-9);
    return c;
}

vec3 set_lum(vec3 c, float target) {
    float d = target - lum(c);
    return clip_color(c + d);
}

void main() {
    if (v_uv.x < 0.0 || v_uv.x > 1.0 || v_uv.y < 0.0 || v_uv.y > 1.0) {
        frag_color = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    vec4 texA   = texture(u_tex,  v_uv);   // A (top)
    vec4 texB   = texture(u_tex2, v_uv);   // B (base)
    vec3 A      = texA.rgb;
    vec3 B      = texB.rgb;
    float alpha_a = texA.a;
    float alpha_b = texB.a;

    // ── Blend mode ────────────────────────────────────────────────────────────
    vec3 blended;
    if      (u_mode == 0)  // over
        blended = A * alpha_a + B * alpha_b * (1.0 - alpha_a);
    else if (u_mode == 1)  // add
        blended = clamp(A + B, 0.0, 1.0);
    else if (u_mode == 2)  // multiply
        blended = A * B;
    else if (u_mode == 3)  // screen
        blended = 1.0 - (1.0 - A) * (1.0 - B);
    else if (u_mode == 4)  // lighten
        blended = max(A, B);
    else if (u_mode == 5)  // darken
        blended = min(A, B);
    else if (u_mode == 6)  // overlay
        blended = mix(2.0 * A * B,
                      1.0 - 2.0 * (1.0 - A) * (1.0 - B),
                      step(vec3(0.5), B));
    else if (u_mode == 7) {  // softlight (W3C formula)
        vec3 D = mix(sqrt(B), (16.0*B - 12.0)*B + 4.0*B, step(B, vec3(0.25)));
        blended = mix(B - (1.0 - 2.0*A) * B * (1.0 - B),
                      B + (2.0*A - 1.0) * (D - B),
                      step(vec3(0.5), A));
    }
    else if (u_mode == 8)  // color (A hue+sat, B lum)
        blended = set_lum(A, lum(B));
    else                   // luma (A lum, B hue+sat)
        blended = set_lum(B, lum(A));

    // ── Opacity ───────────────────────────────────────────────────────────────
    vec3 col = mix(B, blended, u_opacity);

    // ── Optional mask (Rec.601 luma of mask → lerp back to B) ─────────────────
    if (u_has_mask != 0) {
        vec3 mask_rgb = texture(u_tex3, v_uv).rgb;
        float mask_luma = dot(mask_rgb, vec3(0.2989, 0.5870, 0.1140));
        col = mix(B, col, mask_luma);
    }

    col *= pow(2.0, u_ev);

    vec4 texel_for_alpha = texA;  // alpha from A for channel display
    if      (u_channel == 1) col = vec3(col.r);
    else if (u_channel == 2) col = vec3(col.g);
    else if (u_channel == 3) col = vec3(col.b);
    else if (u_channel == 4) col = vec3(texel_for_alpha.a);

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
