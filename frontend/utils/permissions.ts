import { Camera } from "expo-camera";
import { requestRecordingPermissionsAsync } from "expo-audio";
import * as Notifications from "expo-notifications";
import * as Contacts from "expo-contacts";

export const requestAllPermissions = async () => {
    try {
        const results: any = {};
        
        const camera = await Camera.requestCameraPermissionsAsync();
        results.camera = camera.status;

        const mic = await requestRecordingPermissionsAsync();
        results.microphone = mic.status;

        const contacts = await Contacts.requestPermissionsAsync();
        results.contacts = contacts.status;

        const notifications = await Notifications.requestPermissionsAsync();
        results.notifications = notifications.status;

        console.log("Permission results:", results);

        return results;

    } catch (error) {
        console.log("Permission error:", error);
    }
};