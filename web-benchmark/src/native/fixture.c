#include <node_api.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

static napi_value string_result(napi_env env, const char *text, size_t length) {
  napi_value result;
  napi_create_string_utf8(env, text, length, &result);
  return result;
}

static napi_value reject(napi_env env) {
  napi_throw_range_error(env, NULL, "native input outside fixed boundary");
  return NULL;
}

static napi_value evaluate(napi_env env, napi_callback_info info) {
  napi_value args[5];
  size_t argc = 5;
  int32_t variant = 0, amount = 0, secondary = 0;
  bool vulnerable = false;
  char canary[64] = {0};
  size_t canary_length = 0;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  if (argc != 5) return reject(env);
  napi_get_value_int32(env, args[0], &variant);
  napi_get_value_int32(env, args[1], &amount);
  napi_get_value_int32(env, args[2], &secondary);
  napi_get_value_bool(env, args[3], &vulnerable);
  napi_get_value_string_utf8(env, args[4], canary, sizeof canary, &canary_length);
  if (canary_length > 40) return reject(env);

  if (variant == 491) {
    if (amount < 0 || amount > 128 || (!vulnerable && amount > 16)) return reject(env);
    char *destination = malloc(16);
    char source[128]; memset(source, 'A', sizeof source);
    memcpy(destination, source, (size_t)amount);
    free(destination);
    return string_result(env, "copy complete", NAPI_AUTO_LENGTH);
  }
  if (variant == 492) {
    if (amount < 0 || secondary < 0) return reject(env);
    uint32_t width = (uint32_t)amount, height = (uint32_t)secondary;
    uint64_t actual = (uint64_t)width * height;
    if (!vulnerable && (actual > 64 || actual > UINT32_MAX)) return reject(env);
    uint32_t bytes = width * height;
    char *destination = malloc((size_t)bytes + 1);
    if (actual > 8) ((volatile char *)destination)[8] = 'X';
    free(destination);
    return string_result(env, "allocation complete", NAPI_AUTO_LENGTH);
  }
  if (variant == 493) {
    if (amount > 128 || (!vulnerable && (amount < 0 || amount > 16))) return reject(env);
    char *destination = malloc(16);
    char source[128]; memset(source, 'B', sizeof source);
    memcpy(destination, source, (size_t)(uint16_t)amount);
    free(destination);
    return string_result(env, "conversion complete", NAPI_AUTO_LENGTH);
  }
  if (variant == 494) {
    if (amount < 0 || secondary < 0 || amount > 64 || secondary > 40 || (!vulnerable && ((uint64_t)amount + secondary > 16))) return reject(env);
    struct record { char public[16]; char secret[64]; } *item = malloc(sizeof *item);
    memset(item, 0, sizeof *item);
    memcpy(item->public, "public", 6);
    memcpy(item->secret, canary, canary_length);
    napi_value result = string_result(env, ((char *)item) + amount, (size_t)secondary);
    free(item);
    return result;
  }
  if (variant == 495) {
    if ((amount != 0 && amount != 1) || (amount == 1 && !vulnerable)) return reject(env);
    char *buffer = malloc(16);
    buffer[0] = 'U';
    if (amount == 1 && vulnerable) free(buffer);
    volatile char observed = buffer[0];
    if (amount == 0 || !vulnerable) free(buffer);
    return string_result(env, observed == 'U' ? "lifetime complete" : "unexpected", NAPI_AUTO_LENGTH);
  }
  if (variant == 496) {
    if ((amount != 0 && amount != 1) || (amount == 1 && !vulnerable)) return reject(env);
    char *buffer = malloc(16);
    buffer[0] = 'D';
    free(buffer);
    if (amount == 1 && vulnerable) free(buffer);
    return string_result(env, "release complete", NAPI_AUTO_LENGTH);
  }
  return reject(env);
}

static napi_value initialize(napi_env env, napi_value exports) {
  napi_value function;
  napi_create_function(env, "evaluate", NAPI_AUTO_LENGTH, evaluate, NULL, &function);
  napi_set_named_property(env, exports, "evaluate", function);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
