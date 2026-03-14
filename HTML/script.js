
function canvas() {

    const canvas = document.getElementById("water");
    const ctx = canvas.getContext("2d");

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let mouseY = canvas.height / 2;

    document.addEventListener("mousemove", (e) => {
        mouseY = e.clientY;
    });

    let t = 0;

    function draw() {

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let amplitude = mouseY / 15; // water increases when cursor up
        let wavelength = 0.02;

        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);

        for (let x = 0; x < canvas.width; x++) {

            let y = canvas.height / 2 +
                Math.sin(x * wavelength + t) * amplitude;

            ctx.lineTo(x, y);

        }

        ctx.lineTo(canvas.width, canvas.height);
        ctx.lineTo(0, canvas.height);
        ctx.closePath();

        let gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);

        gradient.addColorStop(0, "#00c6ff");
        gradient.addColorStop(1, "#0072ff");

        ctx.fillStyle = gradient;
        ctx.fill();

        t += 0.03;

        requestAnimationFrame(draw);

    }

    draw();
}

canvas();