document.addEventListener('DOMContentLoaded', function () {
    var formatBtn = document.getElementById('formatBtn');
    if (formatBtn) {
        formatBtn.addEventListener('click', function () {
            var ta = document.getElementById('changelogJson');
            try {
                var parsed = JSON.parse(ta.value);
                ta.value = JSON.stringify(parsed, null, 2);
            } catch (e) {
                alert('Cannot format: invalid JSON.\n\n' + e.message);
            }
        });
    }

    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            var form = document.getElementById('changelogForm');
            if (form) form.submit();
        }
    });
});
