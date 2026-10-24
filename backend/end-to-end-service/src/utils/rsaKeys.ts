import { webcrypto } from "crypto";

// Initialize and generate a new RSA key pair (only once)
export async function initKeys() {
    const keyPair = await webcrypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256",
        },
        true,
        ["encrypt", "decrypt"]
    );

    return keyPair
}

// Get the public key as a JWK (JSON Web Key)
export async function getKeyAsJWK(key: CryptoKey) {
    if (!key) throw new Error("Key pair not initialized. Call initKeys() first.");
    return await webcrypto.subtle.exportKey("jwk", key);
}

// Import a JWK public key back into a CryptoKey (optional utility)
export async function importPublicJWK(jwk: JsonWebKey) {
    return await webcrypto.subtle.importKey(
        "jwk",
        jwk,
        {
            name: "RSA-OAEP",
            hash: "SHA-256",
        },
        false,
        ["encrypt"]
    );
}

// Encrypt a message using the current public key
export async function encryptData(publicKey: CryptoKey, plainText: string) {
    if (!publicKey) throw new Error("Key pair not initialized. Call initKeys() first.");

    const encoded = new TextEncoder().encode(plainText);
    const encrypted = await webcrypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        publicKey,
        encoded
    );
    return Buffer.from(encrypted).toString("base64");
}

// Decrypt a base64-encoded ciphertext using the private key
export async function decryptData(privateKey: CryptoKey,base64Cipher: string) {
    if (!privateKey) throw new Error("Key pair not initialized. Call initKeys() first.");

    // Convert Buffer to ArrayBuffer before passing to WebCrypto
    const buffer = Buffer.from(base64Cipher, "base64");
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    const decrypted = await webcrypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        privateKey,
        arrayBuffer
    );

    return new TextDecoder().decode(decrypted);
}
