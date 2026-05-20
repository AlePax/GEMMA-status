#version 330 core

uniform sampler2D u_tex;
uniform float u_ev;
uniform float u_gamma;
uniform int   u_tonemap;
uniform int   u_channel;

// GaussianBlur params
uniform float u_radius;   // pixels (0.5..50)

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

// 7-tap Gaussian kernel: sample at offsets 0, ±r/3, ±2r/3, ±r pixels.
// sigma = r * 0.35 (matches CPU GaussianBlur: sigma = radius * 0.35).
// Horizontal and vertical passes both sample the original texture and average —
// an approximation of separable convolution in a single pass.
vec3 gaussBlur(vec2 uv, vec2 texel_size, float r) {
    float sigma2 = max(r * 0.35, 0.001);
    sigma2 *= sigma2;
    vec3 sumH = vec3(0.0), sumV = vec3(0.0);
    float totH = 0.0, totV = 0.0;
    for (int i = -3; i <= 3; i++) {
        float offset = float(i) * r / 3.0;
        float w = exp(-0.5 * offset * offset / sigma2);
        sumH += w * texture(u_tex, uv + vec2(offset * texel_size.x, 0.0)).rgb;
        sumV += w * texture(u_tex, uv + vec2(0.0, offset * texel_size.y)).rgb;
        totH += w;
        totV += w;
    }
    return (sumH / totH + sumV / totV) * 0.5;
}

void main() {
    if (v_uv.x < 0.0 || v_uv.x > 1.0 || v_uv.y < 0.0 || v_uv.y > 1.0) {
        frag_color = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    vec4 texel = texture(u_tex, v_uv);
    vec2 ts    = 1.0 / vec2(textureSize(u_tex, 0));
    vec3 col   = (u_radius > 0.1) ? gaussBlur(v_uv, ts, u_radius) : texel.rgb;

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
