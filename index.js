import { puter } from '@heyputer/puter.js';

async function main() {
    const response = await puter.ai.chat(
        'Tinjau website untuk HMIF UMB'
    );

    console.log(response);
}

main();