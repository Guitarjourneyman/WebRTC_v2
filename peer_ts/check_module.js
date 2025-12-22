
try {
    require.resolve('socket.io-client');
    console.log('MODULE_FOUND');
} catch (e) {
    console.log('MODULE_MISSING');
}
