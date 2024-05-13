function convertHexToGeohash(hexGeohash) {
    const byteArray = hexToByteArray(hexGeohash);
    let geohash = '';
    for (let i = 0; i < byteArray.length; i++) {
        // Convert byte to ASCII character
        const ascii = byteArray[i];
        if ((ascii >= 48 && ascii <= 57) || (ascii >= 97 && ascii <= 122)) {
            geohash += String.fromCharCode(ascii);
        } else {
            throw new Error('Invalid geohash character');
        }
    }
    return geohash;
}

function hexToByteArray(hexString) {
    const byteArray = [];
    for (let i = 0; i < hexString.length; i += 2) {
        const byte = parseInt(hexString.substr(i, 2), 16);
        byteArray.push(byte);
    }
    return byteArray;
}

module.exports = { convertHexToGeohash }