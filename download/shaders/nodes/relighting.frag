#version 330 core

uniform sampler2D u_tex;     // TEXTURE0 — composite image (pre-relighting)
uniform sampler2D u_tex2;    // TEXTURE1 — normals buffer (world normals, 0..1 encoded)
uniform float u_ev;
uniform float u_gamma;
uniform int   u_tonemap;
uniform int   u_channel;

// Relighting params
uniform float u_azimuth;     // degrees 0..360
uniform float u_elevation;   // degrees 0..90
uniform float u_intensity;   // 0..1
uniform float u_warm;        // -1..1  (negative=cool, positive=warm)
uniform int   u_blend_mode;  // 0=softlight, 1=overlay

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
    vec4 texel = texture(u_tex, v_uv);
    vec3 base  = texel.rgb;

    // Decode world normal: [0,1] → [-1,1], then normalize
    vec3 N = texture(u_tex2, v_uv).rgb * 2.0 - 1.0;
    float nlen = length(N);
    N = (nlen > 1e-6) ? N / nlen : vec3(0.0, 0.0, 1.0);

    // Light direction from azimuth/elevation (degrees → radians)
    float az     = radians(u_azimuth);
    float el     = radians(u_elevation);
    float cos_el = cos(el);
    vec3  L      = vec3(cos_el * sin(az), sin(el), cos_el * cos(az));

    // Half-diffuse: range [0, 0.5] → maps to dark..light
    float d_half = clamp(0.5 + dot(N, L) * 0.5 * u_intensity, 0.0, 1.0);

    // Warm/cool tint (±45% shift on R/B channels, same as CPU node)
    vec3 blend;
    if (abs(u_warm) > 0.001) {
        vec3 tint = vec3(1.0 + u_warm * 0.45, 1.0, 1.0 - u_warm * 0.45);
        blend = clamp(vec3(d_half) * tint, 0.0, 1.0);
    } else {
        blend = vec3(d_half);
    }

    // Blend mode (softlight or overlay), applied per-channel
    vec3 col;
    if (u_blend_mode == 1) {
        // Overlay
        col = mix(2.0 * base * blend,
                  1.0 - 2.0 * (1.0 - base) * (1.0 - blend),
                  step(vec3(0.5), base));
    } else {
        // Soft light: base * (base*(1-2*blend) + 2*blend)
        col = base * (base * (1.0 - 2.0 * blend) + 2.0 * blend);
    }
    col = max(col, vec3(0.0));

    col *= pow(2.0, u_ev);

    if      (u_channel == 1) col = vec3(col.r);
    else if (u_channel == 2) col = vec3(col.g);
    else if (u_channel == 3) col = vec3(col.b);
    else if (u_channel == 4) col = vec3(texel.a);

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
