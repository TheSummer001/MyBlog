// 设置你的建站时间
var startDate = "2025/12/18 00:00:00";

function show_runtime() {
    window.setTimeout("show_runtime()", 1000);
    var X = new Date(startDate);
    var Y = new Date();
    var T = (Y.getTime() - X.getTime());
    var M = 24 * 60 * 60 * 1000;
    var a = T / M;
    var A = Math.floor(a);
    var b = (a - A) * 24;
    var B = Math.floor(b);
    var c = (b - B) * 60;
    var C = Math.floor((b - B) * 60);
    var D = Math.floor((c - C) * 60);

    var runtime_span = document.getElementById("run-time");
    if (runtime_span) {
        runtime_span.innerHTML = A + "天 " + B + "小时 " + C + "分 " + D + "秒";
    }
}
show_runtime();