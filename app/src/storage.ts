import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
export const storage = {
  get: async (key: string) =>
    Platform.OS === "web"
      ? localStorage.getItem(key)
      : SecureStore.getItemAsync(key),
  set: async (key: string, value: string) => {
    if (Platform.OS === "web") localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  },
  remove: async (key: string) => {
    if (Platform.OS === "web") localStorage.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  },
};
