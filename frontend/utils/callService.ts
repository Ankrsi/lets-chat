import { NativeModules, Platform } from "react-native"

const NativeCallService = NativeModules.CallService;

export const CallService = {
    start: (callId: string) => {
        if (Platform.OS === "android" && NativeCallService) {
            NativeCallService.start(callId);
        } else {
            console.log("CallService.start ignored (not Android or module missing)");
        }
    },
    stop: () => {
        if (Platform.OS === "android" && NativeCallService) {
            NativeCallService.stop();
        } else {
            console.log("CallService.stop ignored (not Android or module missing)");
        }
    },
};
