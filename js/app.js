const NumberConstants = Object.freeze({
    LightSpeedConstant: 299792458,
    BaseWavelengthConstant: 1.814,
    EfficiencyFactorConstant: 0.6,
    FsplConstant: 87.55,
    GoodPowerConstant: -50.1,
    FairPowerConstant: -60.1,
    ChartSampleSize: 15,
    SimulationMinimumSampleSize: 2
});
const StringResources = Object.freeze({
    DataNotFilledTitle: 'Data belum lengkap!',
    DataNotFilledMessage: 'Lengkapi semua form terlebih dahulu.',

    PreSimulationNotPerformedTitle: 'Kalkulasi belum dilakukan!',
    PreSimulationNotPerformedMessage: 'Lengkapi semua form dan lakukan kalkulasi terlebih dahulu.',

    SimulatioNoData: 'Simulasi tidak menghasilkan data.',

    SimulationHelpTitle: 'Bantuan Simulasi',
    SimulationHelpMessage: 'Simulasi ini dilakukan dengan mengukur <b>link budget</b> dengan cara\
        menjumlahkan <b>transmit power</b> dari pemancar dan dijumlahkan dengan <b>gain</b> dari\
        parabola, kemudian dikurangi <i>free-space path loss (FSPL)</i>.<br>Perlu diperhatikan\
        bahwa simulasi ini mengabaikan <i>loss</i> dari kedua pemancar dan tidak menghiraukan\
        bentang alam. Hasil simulasi tidak selalu akurat.'
});

var app = new Vue({
    el: '#app',
    data: {
        frequency: 2400000000,
        dish_diameter: null,
        dish_depth: null,
        pipe_diameter: null,
        rows: [
            {key: 'Hasil akan muncul disini', value: null}
        ],

        transmit_power: null,
        min_distance: null,
        max_distance: null,
        simulation: null,
        chart: null
    },

    watch: {
        rows: function () {
          this.$nextTick(function() {
            if ('MathJax' in window) {
                MathJax.typeset();
              }
          });
        }
    },

    methods: {
        calculate: function () {
            if (!validate_calculation(this)) return;

            const wavelengthCentimeters = NumberConstants.LightSpeedConstant / this.frequency * 100;
            const baseWaveLength = Math.PI * this.pipe_diameter / NumberConstants.BaseWavelengthConstant;
            const wifiLocation = wavelengthCentimeters / Math.sqrt(1 - (wavelengthCentimeters / baseWaveLength) ** 2) * 0.75;
            const nonSealedHeight = 3 / 4 * wifiLocation;
            const totalPipeLength = wifiLocation + wifiLocation / 4;
            
            const wavelengthMeters = NumberConstants.LightSpeedConstant / this.frequency;
            const gain = 10 * Math.log10(NumberConstants.EfficiencyFactorConstant * (Math.PI * this.dish_diameter / 100 / wavelengthMeters) ** 2);
            const beamwidth = 70 * wavelengthMeters / (this.dish_diameter / 100);

            const data = [
                { key: 'Frekuensi (\\(f\\))', value: `${toGhz(this.frequency)} GHz` },
                { key: 'Diameter reflektor (\\(Dw\\))', value: `${this.dish_diameter} cm` },
                { key: 'Kedalaman reflektor (\\(dw\\))', value: `${this.dish_depth} cm` },
                { key: 'Diameter pipa feeder (\\(D\\))', value: `${this.pipe_diameter} cm` },
                { key: 'Panjang gelombang (\\(\\lambda\\))', value: `${wavelengthCentimeters?.toFixed(2)} cm` },
                { key: 'Panjang gelombang dasar (\\(\\lambda_{0}\\))', value: `${baseWaveLength?.toFixed(2)} cm` },
                { key: 'Gain (\\(G\\))', value: `${gain?.toFixed(2)} dBi` },
                { key: 'Beamwidth (\\(\\psi\\))', value: `${beamwidth?.toFixed(2)}&deg;` },
                { key: 'Tinggi USB Wi-Fi (\\(\\lambda_{g}\\))', value: `${wifiLocation?.toFixed(2)} cm` },
                { key: 'Tinggi aluminium (\\(\\frac{3}{4}\\lambda_{g}\\))', value: `${nonSealedHeight?.toFixed(2)} cm` },
                { key: 'Panjang pipa (\\(P\\))', value: `${totalPipeLength?.toFixed(2)} cm` }
            ];

            this.rows = data; 
        },

        run_simulation: function() {
            if (!validate_pre_simulation(this)) return;
            if (!validate_simulation(this)) return;

            const wavelengthMeters = NumberConstants.LightSpeedConstant / this.frequency;
            const gain = 10 * Math.log10(NumberConstants.EfficiencyFactorConstant * (Math.PI * this.dish_diameter / 100 / wavelengthMeters) ** 2);
            const logFspl = (20 * Math.log10(toMhz(this.frequency))) - NumberConstants.FsplConstant;

            const simulationResult = [];
            let counter = this.min_distance;

            while (counter > this.min_distance - 1 && counter < this.max_distance + 1) {
                const fspl = (20 * Math.log10(counter)) + logFspl;
                simulationResult.push({ 
                    power: this.transmit_power + gain - fspl,
                    distance: counter
                });
                counter++;
            }

            // generate result
            if (simulationResult.length <= NumberConstants.SimulationMinimumSampleSize) {
                this.simulation = {
                    message: StringResources.SimulatioNoData
                };
            }
            else
            {
                const min_power = getMaximumPower(simulationResult, NumberConstants.FairPowerConstant);
                const optimal_power = getMaximumPower(simulationResult, NumberConstants.GoodPowerConstant);
                this.simulation = {
                    max_distance: min_power.distance,
                    max_distance_power: min_power.power,
                    optimal_distance: optimal_power.distance,
                    optimal_distance_power: optimal_power.power,
                };
                
                this.chart.data.labels = distributedCopy(simulationResult.map(x => x.power).reverse(), NumberConstants.ChartSampleSize);
                this.chart.data.datasets[0].data = distributedCopy(simulationResult.map(x => x.distance).reverse(), NumberConstants.ChartSampleSize);
                this.chart.update();
            }
        },

        simulation_help: function() {
            Swal.fire({
                title: StringResources.SimulationHelpTitle,
                html: StringResources.SimulationHelpMessage,
                icon: 'info',
                confirmButtonText: 'Tutup'
            });
        }
    },

    mounted() {
        var ctx = document.getElementById('simulation_chart').getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                }]
            },
            options: {
                legend: {
                    display: false
                },
                scales: {
                    xAxes: [{
                        scaleLabel: {
                            display: true,
                            labelString: 'Transmission Power (dBm)'
                        },
                        ticks: {
                            callback: function(value, index, values) {
                                return value.toFixed(2);
                            }
                        }
                    }],
                    yAxes: [{
                        type: 'logarithmic',
                        scaleLabel: {
                            display: true,
                            labelString: 'Jarak (meter)'
                        },
                        ticks: {
                            callback: function(value, index, values) {
                                return value;
                            }
                        }
                    }]
                }
            }
        });
    },
});

function validate_calculation(obj) {
    if (!obj.dish_diameter || !obj.dish_depth || !obj.pipe_diameter)
    {
        Swal.fire({
            title: StringResources.DataNotFilledTitle,
            text: StringResources.DataNotFilledTitle,
            icon: 'error',
            confirmButtonText: 'Tutup'
        });
        return false;
    }

    return true;
}

function validate_pre_simulation(obj) {
    if (!obj.dish_diameter || !obj.dish_depth || !obj.pipe_diameter)
    {
        Swal.fire({
            title: StringResources.PreSimulationNotPerformedTitle,
            text: StringResources.PreSimulationNotPerformedMessage,
            icon: 'error',
            confirmButtonText: 'Tutup'
        });
        return false;
    }

    return true;
}

function validate_simulation(obj) {
    if (!obj.transmit_power || !obj.min_distance || !obj.min_distance)
    {
        Swal.fire({
            title: StringResources.DataNotFilledTitle,
            text: StringResources.DataNotFilledMessage,
            icon: 'error',
            confirmButtonText: 'Tutup'
        });
        return false;
    }

    return true;
}

function toGhz(value) {
    return value / 10 ** 9;
}

function toMhz(value) {
    return value / 10 ** 3;
}

function getMaximumPower(arr, cutoff) {
    const filtered =  arr.filter(x => x.power > cutoff);
    if (filtered.length == 0)
    {
        return {
            power: 'Tidak ada.',
            distance: 'Tidak ada.'
        }
    }

    const candidate = filtered[filtered.length - 1];
    return {
        power: candidate.power.toFixed(2),
        distance: candidate.distance.toFixed(2)
    };
}

// https://stackoverflow.com/a/32440410
function distributedCopy(items, n) {
    var elements = [items[0]];
    var totalItems = items.length - 2;
    var interval = Math.floor(totalItems/(n - 2));
    for (var i = 1; i < n - 1; i++) {
        elements.push(items[i * interval]);
    }
    elements.push(items[items.length - 1]);
    return elements;
}